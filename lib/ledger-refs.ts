/**
 * 账本主数据引用解析（ledger refs）· 公共工具
 * 收敛「按名称匹配或自动创建 分类/账户」的重复逻辑：
 * - app/actions/investments.ts（投资收益/亏损/派息自动记账时按 name+type 确保分类）
 * - app/api/import/route.ts（Excel 导入时按名称自动创建缺失账户/分类）
 * 统一经本模块的 ensureCategory / ensureAccount 完成，两处行为一致、单点维护。
 * Ledger master-data reference resolution (ledger refs) · shared utilities
 * Consolidates the duplicated "match by name or auto-create category/account" logic:
 * - app/actions/investments.ts (auto-categorize on investment profit/loss/dividend)
 * - app/api/import/route.ts (auto-create missing accounts/categories on Excel import)
 * Centralized via ensureCategory / ensureAccount here so both behave identically and are maintained in one place.
 */
import { categories, tags, projects, accounts } from "@/db/schema"
import { DEFAULT_CURRENCY, ACCT, TX, type CategoryType } from "@/lib/constants"



import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";




/** 事务句柄类型（与 withAudit 回调一致）/ Transaction handle type (matches the withAudit callback) */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 按「账本 + 名称 + 类型」匹配分类，缺失则自动创建，返回分类 id。
 * cache：可选「key → id」内存缓存，命中避免查库；写入时自动回填。
 * key 规则：`${type}::${name}`（同名但收支类型不同视为不同分类）。
 * Match a category by ledger + name + type; auto-create if missing; return its id.
 * cache: optional in-memory "key → id" cache; a hit skips the DB; written back on create.
 * key rule: `${type}::${name}` (same name but different income/expense type ⇒ different category).
 */
export async function ensureCategory(
  tx: Tx,
  ledgerId: string,
  name: string,
  type: CategoryType,
  cache?: Map<string, string>,
): Promise<string> {
  const cacheKey = `${type}::${name}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;
  const [exist] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(
      eq(categories.ledgerId, ledgerId),
      eq(categories.name, name),
      eq(categories.type, type),
    ))
    .limit(1);
  if (exist) { cache?.set(cacheKey, exist.id); return exist.id; }
  const [created] = await tx
    .insert(categories)
    .values({ ledgerId, name, type, icon: type === TX.income ? "📈" : "📉" })
    .returning({ id: categories.id });
  cache?.set(cacheKey, created.id);
  return created.id;
}

/** 自动创建账户的选项 / Options for auto-creating an account */
export interface EnsureAccountOpts {
  createdBy: string;
  icon?: string;
  currencyCode?: string;
  /** 「名称 → id」内存缓存，命中避免查库，写入自动回填 / "name → id" in-memory cache; hit skips DB, written back on create */
  cache?: Map<string, string>;
}

/**
 * 按「账本 + 名称」匹配账户，缺失则自动创建（默认 custom / 💳 / CNY / 资产类，与 Excel 导入口径一致）
 * Match an account by ledger + name; auto-create if missing (default custom / 💳 / CNY / asset, matching Excel import).
 */
export async function ensureAccount(
  tx: Tx,
  ledgerId: string,
  name: string,
  opts: EnsureAccountOpts,
): Promise<string> {
  const cached = opts.cache?.get(name);
  if (cached) return cached;
  const [exist] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.name, name)))
    .limit(1);
  if (exist) { opts.cache?.set(name, exist.id); return exist.id; }
  const [created] = await tx
    .insert(accounts)
    .values({
      ledgerId, name, type: ACCT.custom,
      icon: opts.icon ?? "💳",
      currencyCode: opts.currencyCode ?? DEFAULT_CURRENCY,
      openingBalanceCents: 0,
      isAsset: true,
      createdBy: opts.createdBy,
    })
    .returning({ id: accounts.id });
  opts.cache?.set(name, created.id);
  return created.id;
}

/** 引用不属于当前账本时抛出，由调用方转为 i18n 错误码 / Thrown when a reference does not belong to the ledger; caller maps it to an i18n error code */
export class RefNotInLedgerError extends Error {
  constructor(public field: string) {
    super(`reference ${field} does not belong to the ledger`);
    this.name = "RefNotInLedgerError";
  }
}

/**
 * 校验「引用类字段」属于当前账本，防止跨账本越权注入。
 * 在事务内（tx）调用；任一引用不属于该账本则抛 RefNotInLedgerError（事务回滚）。
 * Validate that reference fields belong to the current ledger, preventing cross-ledger privilege injection.
 * Called inside a transaction (tx); any reference outside the ledger throws RefNotInLedgerError (tx rolls back).
 */
export async function assertRefsInLedger(
  tx: Tx,
  ledgerId: string,
  refs: {
    accountId?: string | null;
    toAccountId?: string | null;
    paymentAccountId?: string | null;
    categoryId?: string | null;
    projectId?: string | null;
    tagIds?: string[] | null;
  },
): Promise<void> {
  // 单值引用：表驱动批量校验（消除 5 段复制粘贴，新增字段只加一行）/ Single refs: table-driven batch validation (removes 5 copy-paste blocks; add a field with one line)
  const singleRefs = [
    { field: "accountId", table: accounts, value: refs.accountId },
    { field: "toAccountId", table: accounts, value: refs.toAccountId },
    { field: "paymentAccountId", table: accounts, value: refs.paymentAccountId },
    { field: "categoryId", table: categories, value: refs.categoryId },
    { field: "projectId", table: projects, value: refs.projectId },
  ];

  for (const { field, table, value } of singleRefs) {
    if (!value) continue;
    const [row] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.ledgerId, ledgerId), eq(table.id, value)))
      .limit(1);
    if (!row) throw new RefNotInLedgerError(field);
  }
  if (refs.tagIds && refs.tagIds.length > 0) {
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.ledgerId, ledgerId), inArray(tags.id, refs.tagIds)));
    const valid = new Set(rows.map((r) => r.id));
    if (!refs.tagIds.every((id) => valid.has(id))) throw new RefNotInLedgerError("tagIds");
  }
}
