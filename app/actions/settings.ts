"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { settings, currencies, balances, accounts } from "@/db/schema";
import { requireUser } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";

/** 全局设置仅管理员可改 / Global settings are admin-only */
async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("errors.adminOnly");
  return user;
}

const settingKeys = [
  "app_name",
  "app_name_zh",
  "app_name_en",
  "app_slogan_zh",
  "app_slogan_en",
  "default_locale",
  "allow_registration",
  "enable_login_captcha",
  "audit_log_retention_days",
  "copyright",
  "allowed_page_sizes",
  "default_page_size",
];

/** 更新全局设置（写操作 + 审计）/ Update a global setting */
export async function updateSetting(key: string, value: string) {
  const user = await requireAdmin();
  if (!settingKeys.includes(key)) return { ok: false as const, error: "errors.unknownSetting" };

  // 操作日志保留天数：后端数字范围校验（防止前端被绕过）
  if (key === "audit_log_retention_days") {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 3650) {
      return { ok: false as const, error: "errors.retentionDaysInvalid" };
    }
  }

  // 允许的每页条数：逗号分隔的正整数，至少 1 个，最多 10 个，每个 1-1000
  if (key === "allowed_page_sizes") {
    const sizes = value.split(",").map((s) => parseInt(s.trim(), 10));
    if (sizes.length === 0 || sizes.length > 10 || sizes.some((n) => isNaN(n) || n < 1 || n > 1000)) {
      return { ok: false as const, error: "errors.allowedPageSizesInvalid" };
    }
  }

  // 默认每页条数：必须是正整数
  if (key === "default_page_size") {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 1000) {
      return { ok: false as const, error: "errors.defaultPageSizeInvalid" };
    }
  }

  await withAudit(
    { userId: user.id, action: "U", entity: "setting", summary: `设置 ${key}: ${value}`, requestBody: JSON.stringify({ key, value }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      // upsert：基于 (user_id, key) 唯一约束，避免 delete + insert 丢失主键与 updated_at 语义
      await tx
        .insert(settings)
        .values({ key, value, userId: "global", updatedBy: user.id })
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { value, updatedBy: user.id },
        });
    },
  );
  revalidatePath("/settings");
  revalidatePath("/login");
  return { ok: true as const, error: null };
}

/** 更新币种汇率 / Update currency rate */
export async function updateCurrencyRate(code: string, rate: string) {
  const user = await requireAdmin();
  const r = parseFloat(rate);
  if (!isFinite(r) || r <= 0) return { ok: false as const, error: "errors.rateInvalid" };
  await withAudit(
    { userId: user.id, action: "U", entity: "currency", entityId: code, summary: `更新汇率 ${code}=${rate}`, requestBody: JSON.stringify({ code, rate }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(currencies).set({ rate }).where(inArray(currencies.code, [code]));
    },
  );
  revalidatePath("/settings");
  return { ok: true as const, error: null };
}

/** 启用/停用币种 / Toggle currency active */
export async function toggleCurrency(code: string, isActive: boolean) {
  const user = await requireAdmin();
  await withAudit(
    { userId: user.id, action: "U", entity: "currency", entityId: code, summary: `${isActive ? "启用" : "停用"}币种 ${code}`, requestBody: JSON.stringify({ code, isActive }), responseBody: '{"result":"updated"}' },
    async (tx) => { await tx.update(currencies).set({ isActive }).where(inArray(currencies.code, [code])); },
  );
  revalidatePath("/settings");
  return { ok: true as const, error: null };
}

const currencySchema = z.object({
  code: z.string().min(1).max(8),
  symbol: z.string().min(1).max(4),
  nameZh: z.string().min(1).max(30),
  nameEn: z.string().min(1).max(30),
  rate: z.string().min(1),
  isActive: z.boolean().optional(),
  remark: z.string().max(200).optional(),
});

/** 新增币种 / Create currency */
export async function createCurrency(input: z.infer<typeof currencySchema>) {
  const user = await requireAdmin();
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const r = parseFloat(d.rate);
  if (!isFinite(r) || r <= 0) return { ok: false as const, error: "errors.rateInvalid" };

  // 检查 code 是否已存在
  const [existing] = await db.select().from(currencies).where(eq(currencies.code, d.code)).limit(1);
  if (existing) return { ok: false as const, error: "errors.currencyExists" };

  await withAudit(
    { userId: user.id, action: "C", entity: "currency", entityId: d.code, summary: `新增币种 ${d.code} ${d.nameZh}`, requestBody: JSON.stringify({ code: d.code, symbol: d.symbol, nameZh: d.nameZh, nameEn: d.nameEn, rate: d.rate, remark: d.remark ?? "" }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(currencies).values({
        code: d.code, symbol: d.symbol, nameZh: d.nameZh, nameEn: d.nameEn,
        rate: d.rate, isActive: d.isActive ?? true, remark: d.remark ?? "",
      });
    },
  );
  revalidatePath("/settings/currencies");
  return { ok: true as const };
}

/** 编辑币种（code 不可改）/ Update currency */
export async function updateCurrency(code: string, input: Omit<z.infer<typeof currencySchema>, "code">) {
  const user = await requireAdmin();
  const parsed = currencySchema.omit({ code: true }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const r = parseFloat(d.rate);
  if (!isFinite(r) || r <= 0) return { ok: false as const, error: "errors.rateInvalid" };

  await withAudit(
    { userId: user.id, action: "U", entity: "currency", entityId: code, summary: `编辑币种 ${code}`, requestBody: JSON.stringify({ code, symbol: d.symbol, nameZh: d.nameZh, nameEn: d.nameEn, rate: d.rate, isActive: d.isActive, remark: d.remark ?? "" }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(currencies).set({
        symbol: d.symbol, nameZh: d.nameZh, nameEn: d.nameEn,
        rate: d.rate, isActive: d.isActive ?? true, remark: d.remark ?? "",
      }).where(eq(currencies.code, code));
    },
  );
  revalidatePath("/settings/currencies");
  return { ok: true as const };
}

/** 删除币种（禁止删除基准币种和已被账户引用的币种）/ Delete currency */
export async function deleteCurrency(code: string) {
  const user = await requireAdmin();

  // 禁止删除基准币种
  const [cur] = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!cur) return { ok: false as const, error: "errors.currencyNotFound" };
  if (cur.isBase) return { ok: false as const, error: "errors.baseCurrencyNotDeletable" };

  // 检查是否被账户引用
  const [used] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.currencyCode, code)).limit(1);
  if (used) return { ok: false as const, error: "errors.currencyInUse" };

  await withAudit(
    { userId: user.id, action: "D", entity: "currency", entityId: code, summary: `删除币种 ${code}`, requestBody: JSON.stringify({ code }), responseBody: '{"result":"deleted"}' },
    async (tx) => {
      await tx.delete(currencies).where(eq(currencies.code, code));
    },
  );
  revalidatePath("/settings/currencies");
  return { ok: true as const };
}

const balanceSchema = z.object({
  accountId: z.string().min(1),
  balanceYuan: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
});

/** 记录余额快照 / Record a balance snapshot */
export async function recordBalance(input: z.infer<typeof balanceSchema>) {
  const user = await requireUser();
  const parsed = balanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  // 统一走 yuanToCents（支持负余额快照，且与其他 action 口径一致）
  const cents = yuanToCents(d.balanceYuan);
  if (cents === null) return { ok: false as const, error: "errors.amountInvalid" };

  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };

  // 账户必须属于当前账本（防止引用他人账本账户）
  const [acct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, d.accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!acct) return { ok: false as const, error: "errors.accountNotFound" };

  await withAudit(
    { userId: user.id, action: "C", entity: "balance", summary: `记录余额快照 ${d.accountId}`, requestBody: JSON.stringify({ accountId: d.accountId, balanceYuan: d.balanceYuan, snapshotDate: d.snapshotDate, remark: d.remark ?? null }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(balances).values({
        ledgerId, accountId: d.accountId,
        balanceAmountCents: cents, snapshotDate: d.snapshotDate,
        remark: d.remark ?? null, createdBy: user.id,
      });
    },
  );
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}
