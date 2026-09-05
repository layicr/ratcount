import { and, eq, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts, transactions, categories, tags, projects,
  transactionTags, balances, currencies,
} from "@/db/schema";
import { inSql, monthRange } from "@/lib/sql-utils";

/**
 * 综合查询层：页面数据源（只读）
 * 核心口径：账户余额不落库，由期初 + 流水实时汇总
 * 性能优化：时间范围过滤下推到 SQL，避免全表加载后内存过滤
 */

type TxRow = {
  accountId: string | null;
  toAccountId: string | null;
  type: string;
  amountCents: number;
  txDate?: string; // 余额计算不需要，仅趋势/月度统计需要
};

/** 计算账户余额增量（income+/expense-/transfer 出-入+） */
export function computeBalanceDelta(txs: TxRow[]): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (acct: string | null, amt: number) => {
    if (!acct) return;
    delta.set(acct, (delta.get(acct) ?? 0) + amt);
  };
  for (const t of txs) {
    if (t.type === "income") add(t.accountId, t.amountCents);
    else if (t.type === "expense") add(t.accountId, -t.amountCents);
    else {
      add(t.accountId, -t.amountCents);
      add(t.toAccountId, t.amountCents);
    }
  }
  return delta;
}

/** 账户列表 + 实时余额 */
export async function listAccountsWithBalance(ledgerId: string) {
  const accts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ledgerId, ledgerId))
    .orderBy(accounts.sort, accounts.name);
  // 余额计算只需 4 个字段，减少数据传输
  const txs = await db
    .select({
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      type: transactions.type,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  const delta = computeBalanceDelta(txs);
  return accts.map((a) => ({
    ...a,
    balanceCents: a.openingBalanceCents + (delta.get(a.id) ?? 0),
  }));
}

/** 流水列表（含分类/账户/项目/标签） */
export async function listTransactions(
  ledgerId: string,
  opts: { type?: string; categoryId?: string; q?: string; accountId?: string; projectId?: string; startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number; limit?: number; offset?: number } = {},
) {
  const conds: ReturnType<typeof and>[] = [eq(transactions.ledgerId, ledgerId)];
  if (opts.type) conds.push(eq(transactions.type, opts.type as "income" | "expense" | "transfer"));
  if (opts.categoryId) conds.push(eq(transactions.categoryId, opts.categoryId));
  if (opts.q) {
    const likePattern = `%${opts.q}%`;
    conds.push(sql`(${transactions.remark} LIKE ${likePattern} OR ${transactions.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${projects.name} LIKE ${likePattern}) OR ${transactions.id} IN (SELECT ${transactionTags.transactionId} FROM ${transactionTags} WHERE ${transactionTags.tagId} IN (SELECT ${tags.id} FROM ${tags} WHERE ${tags.name} LIKE ${likePattern})))`);
  }
  if (opts.accountId) conds.push(sql`(${transactions.accountId} = ${opts.accountId} OR ${transactions.toAccountId} = ${opts.accountId})`);
  if (opts.projectId) conds.push(eq(transactions.projectId, opts.projectId));
  if (opts.startDate) conds.push(sql`${transactions.txDate} >= ${opts.startDate}`);
  if (opts.endDate) conds.push(sql`${transactions.txDate} <= ${opts.endDate}`);
  if (opts.minAmount !== undefined) conds.push(sql`${transactions.amountCents} >= ${opts.minAmount}`);
  if (opts.maxAmount !== undefined) conds.push(sql`${transactions.amountCents} <= ${opts.maxAmount}`);
  const query = db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.txDate), desc(transactions.createdAt))
    .limit(opts.limit ?? 100);
  if (opts.offset) query.offset(opts.offset);
  const rows = await query;
  // 关联数据（用 inSql 工具函数减少重复模板）
  const accountIds = [...new Set(rows.map((r) => [r.accountId, r.toAccountId]).flat().filter(Boolean))] as string[];
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))] as string[];
  const projIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];
  const txIds = rows.map((r) => r.id);
  const [acctMap, catMap, projMap, tagLinks, tagMap] = await Promise.all([
    accountIds.length
      ? db.select().from(accounts).where(inSql(accounts.id, accountIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    catIds.length
      ? db.select().from(categories).where(inSql(categories.id, catIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    projIds.length
      ? db.select().from(projects).where(inSql(projects.id, projIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    txIds.length
      ? db.select().from(transactionTags).where(inSql(transactionTags.transactionId, txIds))
      : [],
    db.select().from(tags).where(eq(tags.ledgerId, ledgerId)).then((r) => new Map(r.map((x) => [x.id, x]))),
  ]);
  return rows.map((r) => ({
    ...r,
    account: acctMap.get(r.accountId),
    toAccount: r.toAccountId ? acctMap.get(r.toAccountId) : undefined,
    category: r.categoryId ? catMap.get(r.categoryId) : undefined,
    project: r.projectId ? projMap.get(r.projectId) : undefined,
    tagList: tagLinks
      .filter((l) => l.transactionId === r.id)
      .map((l) => tagMap.get(l.tagId))
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  }));
}

/** 本月标识（本地时间，YYYY-MM） / Current month key in local time */
export function monthKey(date: Date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** 仪表盘统计（时间范围下推到 SQL，避免全表加载） */
export async function dashboardStats(ledgerId: string) {
  const accts = await listAccountsWithBalance(ledgerId);
  const now = new Date();
  const mk = monthKey(now);

  // 近 6 个月起止（SQL 层过滤，替代全表加载后内存过滤）
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const trendStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
  const { start: monthStart, end: monthEnd } = monthRange(now.getFullYear(), now.getMonth() + 1);

  // 本月流水（SQL 过滤）
  const monthTxs = await db
    .select({ type: transactions.type, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, monthStart),
      lte(transactions.txDate, monthEnd),
    ));

  // 近 6 月流水（SQL 过滤，用于趋势）
  const trendTxs = await db
    .select({ type: transactions.type, amountCents: transactions.amountCents, txDate: transactions.txDate })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, trendStart),
    ));

  // 净资产 = Σ is_asset 余额 + Σ 负债（is_asset=false 的信用类）
  let assets = 0, liabilities = 0;
  for (const a of accts) {
    if (a.isAsset) assets += a.balanceCents;
    else if (a.balanceCents < 0) liabilities += Math.abs(a.balanceCents);
  }
  const netWorth = assets - liabilities;

  let monthIncome = 0, monthExpense = 0;
  for (const t of monthTxs) {
    if (t.type === "income") monthIncome += t.amountCents;
    if (t.type === "expense") monthExpense += t.amountCents;
  }

  // 趋势：近 6 月（用 Map O(1) 分组，替代 find O(n)）
  const trend: { m: string; income: number; expense: number }[] = [];
  const trendMap = new Map<string, { income: number; expense: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    trend.push({ m: key, income: 0, expense: 0 });
    trendMap.set(key, trend[trend.length - 1]);
  }
  for (const t of trendTxs) {
    const slot = trendMap.get(t.txDate.slice(0, 7));
    if (slot) {
      if (t.type === "income") slot.income += t.amountCents;
      if (t.type === "expense") slot.expense += t.amountCents;
    }
  }

  // 资产分布（按账户类型，is_asset）
  const dist = new Map<string, number>();
  for (const a of accts) if (a.isAsset && a.balanceCents > 0) {
    dist.set(a.type, (dist.get(a.type) ?? 0) + a.balanceCents);
  }
  const distTotal = [...dist.values()].reduce((s, x) => s + x, 0);
  const distribution = [...dist.entries()].map(([type, v]) => ({
    type,
    cents: v,
    pct: distTotal ? Math.round((v / distTotal) * 1000) / 10 : 0,
  })).sort((a, b) => b.cents - a.cents);

  const recent = await listTransactions(ledgerId, { limit: 6 });

  return {
    netWorth, assets, liabilities,
    monthIncome, monthExpense, monthBalance: monthIncome - monthExpense,
    balanceRate: monthIncome ? Math.round(((monthIncome - monthExpense) / monthIncome) * 1000) / 10 : 0,
    trend, distribution,
    recent,
    totalBalance: accts.reduce((s, a) => s + (a.isAsset ? a.balanceCents : 0), 0),
  };
}

/** 分类占比（本月支出/收入，SQL 层时间过滤） */
export async function categoryBreakdown(ledgerId: string, type: "expense" | "income") {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthRange(now.getFullYear(), now.getMonth() + 1);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      eq(transactions.type, type),
      gte(transactions.txDate, monthStart),
      lte(transactions.txDate, monthEnd),
    ));
  const cats = await db.select().from(categories).where(eq(categories.ledgerId, ledgerId));
  const map = new Map<string, number>();
  for (const r of rows) if (r.categoryId) map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + r.amountCents);
  const total = [...map.values()].reduce((s, x) => s + x, 0);
  return [...map.entries()].map(([id, v]) => ({
    category: cats.find((c) => c.id === id),
    cents: v,
    pct: total ? Math.round((v / total) * 1000) / 10 : 0,
  })).sort((a, b) => b.cents - a.cents);
}

/** 项目盈亏（Map 分组 O(n)，替代嵌套 filter O(n*m)） */
export async function projectSummary(ledgerId: string) {
  const projs = await db.select().from(projects).where(eq(projects.ledgerId, ledgerId));
  const txs = await db
    .select({ projectId: transactions.projectId, type: transactions.type, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), sql`${transactions.projectId} IS NOT NULL`));
  // 一次遍历分组到 Map（O(n)）
  const stats = new Map<string, { income: number; expense: number }>();
  for (const t of txs) {
    if (!t.projectId) continue;
    const s = stats.get(t.projectId) ?? { income: 0, expense: 0 };
    if (t.type === "income") s.income += t.amountCents;
    if (t.type === "expense") s.expense += t.amountCents;
    stats.set(t.projectId, s);
  }
  return projs.map((p) => {
    const s = stats.get(p.id) ?? { income: 0, expense: 0 };
    return { ...p, income: s.income, expense: s.expense, balance: s.income - s.expense };
  });
}

/** 标签统计（transactionTags 通过子查询过滤到当前账本，Map O(1) 查找） */
export async function tagSummary(ledgerId: string) {
  const tgs = await db.select().from(tags).where(eq(tags.ledgerId, ledgerId));
  // transactionTags 无 ledgerId，通过 transactionId 子查询过滤到当前账本
  const ledgerTxIds = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  const txIdSet = new Set(ledgerTxIds.map((t) => t.id));
  const links = await db.select({ transactionId: transactionTags.transactionId, tagId: transactionTags.tagId }).from(transactionTags);
  // 流水金额 Map（O(1) 查找）
  const txAmt = new Map<string, number>();
  const allTxs = await db
    .select({ id: transactions.id, amountCents: transactions.amountCents })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  for (const t of allTxs) txAmt.set(t.id, t.amountCents);

  const amt = new Map<string, number>();
  const cnt = new Map<string, number>();
  for (const l of links) {
    if (!txIdSet.has(l.transactionId)) continue; // 跳过非当前账本的关联
    const amount = txAmt.get(l.transactionId);
    if (amount === undefined) continue;
    amt.set(l.tagId, (amt.get(l.tagId) ?? 0) + amount);
    cnt.set(l.tagId, (cnt.get(l.tagId) ?? 0) + 1);
  }
  return tgs.map((t) => ({ ...t, amountCents: amt.get(t.id) ?? 0, count: cnt.get(t.id) ?? 0 }));
}

/** 年度汇总（SQL 层年度过滤） */
export async function yearSummary(ledgerId: string, year = new Date().getFullYear()) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const txs = await db
    .select({ type: transactions.type, amountCents: transactions.amountCents, txDate: transactions.txDate })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, yearStart),
      lte(transactions.txDate, yearEnd),
    ));
  const months: { m: string; income: number; expense: number }[] = [];
  for (let i = 1; i <= 12; i++) months.push({ m: String(i), income: 0, expense: 0 });
  for (const t of txs) {
    const mi = parseInt(t.txDate.slice(5, 7), 10);
    if (mi >= 1 && mi <= 12) {
      if (t.type === "income") months[mi - 1].income += t.amountCents;
      if (t.type === "expense") months[mi - 1].expense += t.amountCents;
    }
  }
  return months;
}

/** 余额快照列表（对账） */
export async function listBalances(ledgerId: string) {
  const accts = await listAccountsWithBalance(ledgerId);
  const snaps = await db
    .select()
    .from(balances)
    .where(eq(balances.ledgerId, ledgerId));
  // 每账户最新快照
  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) {
    const cur = latest.get(s.accountId);
    if (!cur || s.snapshotDate > cur.snapshotDate) latest.set(s.accountId, s);
  }
  return accts.map((a) => {
    const snap = latest.get(a.id);
    return {
      ...a,
      snapshot: snap ?? null,
      diff: snap ? a.balanceCents - snap.balanceAmountCents : null,
    };
  });
}

/** 币种列表 */
export async function listCurrencies() {
  return db.select().from(currencies).orderBy(currencies.sort, currencies.code);
}

/** 流水总数（用于分页） */
export async function countTransactions(
  ledgerId: string,
  opts: { type?: string; categoryId?: string; q?: string; accountId?: string; projectId?: string; startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number } = {},
): Promise<number> {
  const conds: ReturnType<typeof and>[] = [eq(transactions.ledgerId, ledgerId)];
  if (opts.type) conds.push(eq(transactions.type, opts.type as "income" | "expense" | "transfer"));
  if (opts.categoryId) conds.push(eq(transactions.categoryId, opts.categoryId));
  if (opts.q) {
    const likePattern = `%${opts.q}%`;
    conds.push(sql`(${transactions.remark} LIKE ${likePattern} OR ${transactions.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${projects.name} LIKE ${likePattern}) OR ${transactions.id} IN (SELECT ${transactionTags.transactionId} FROM ${transactionTags} WHERE ${transactionTags.tagId} IN (SELECT ${tags.id} FROM ${tags} WHERE ${tags.name} LIKE ${likePattern})))`);
  }
  if (opts.accountId) conds.push(sql`(${transactions.accountId} = ${opts.accountId} OR ${transactions.toAccountId} = ${opts.accountId})`);
  if (opts.projectId) conds.push(eq(transactions.projectId, opts.projectId));
  if (opts.startDate) conds.push(sql`${transactions.txDate} >= ${opts.startDate}`);
  if (opts.endDate) conds.push(sql`${transactions.txDate} <= ${opts.endDate}`);
  if (opts.minAmount !== undefined) conds.push(sql`${transactions.amountCents} >= ${opts.minAmount}`);
  if (opts.maxAmount !== undefined) conds.push(sql`${transactions.amountCents} <= ${opts.maxAmount}`);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conds));
  return Number(row?.count ?? 0);
}

/** 账户类型中文映射 / Account type labels */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "现金", debit_card: "储蓄卡", credit_card: "信用账户", wechat: "虚拟账户",
  savings: "定期", investment: "股票", fund: "基金", precious_metal: "贵金属",
  bond: "国债", foreign_currency: "外币账户", custom: "自定义",
};
