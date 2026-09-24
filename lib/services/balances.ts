// ratcount · 余额快照业务服务 / Balance snapshot business service
//  - 从 app/actions/balances 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, balances } from "@/db/schema";
import { AUDIT_ACTION, ENTITY } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { loadCurrencyRates, rateOf, toBaseCents } from "@/lib/currency";
import { type Actor } from "./guard";

const balanceSchema = z.object({
  accountId: z.string().min(1),
  balanceYuan: z.string().min(1).max(20),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
});
export type BalanceInput = z.infer<typeof balanceSchema>;

/* ===================== 余额快照 / Balance ===================== */

/** 记录余额快照 / Record a balance snapshot */
export async function recordBalanceService(actor: Actor, ledgerId: string, input: BalanceInput) {
  const parsed = balanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const cents = yuanToCents(d.balanceYuan);
  if (cents === null) return { ok: false as const, error: "errors.amountInvalid" };

  // 账户必须属于当前账本（防止引用他人账本账户）
  const [acct] = await db
    .select({ id: accounts.id, currencyCode: accounts.currencyCode })
    .from(accounts)
    .where(and(eq(accounts.id, d.accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!acct) return { ok: false as const, error: "errors.accountNotFound" };
  const rates = await loadCurrencyRates();
  const usedRate = rateOf(rates, acct.currencyCode);
  const baseCents = toBaseCents(cents, usedRate);

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.balance,
      summaryKey: "audit.balanceCreated",
      summaryParams: { accountId: d.accountId },
      requestBody: JSON.stringify({ accountId: d.accountId, balanceYuan: d.balanceYuan, snapshotDate: d.snapshotDate, remark: d.remark ?? null }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(balances).values({
        ledgerId,
        accountId: d.accountId,
        balanceAmountCents: cents,
        currencyCode: acct.currencyCode,
        usedRate,
        baseBalanceAmountCents: baseCents,
        snapshotDate: d.snapshotDate,
        remark: d.remark ?? null,
        createdBy: actor.id,
      });
    },
  );
  return { ok: true as const, error: null };
}
