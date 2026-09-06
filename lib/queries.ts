import { and, eq, desc, gte, lte, sql, inArray, or, like, SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts, transactions, categories, tags, projects,
  transactionTags, balances, currencies, auditLogs, users,
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
  // 余额增量在 SQL 层按 (账户 × 转入账户 × 类型) 聚合，聚合后行数 ≪ 流水总数
  const grouped = await db
    .select({
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      type: transactions.type,
      sum: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId))
    .groupBy(transactions.accountId, transactions.toAccountId, transactions.type);
  const delta = computeBalanceDelta(
    grouped.map((r) => ({
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      type: r.type,
      amountCents: Number(r.sum),
    })),
  );
  return accts.map((a) => ({
    ...a,
    balanceCents: a.openingBalanceCents + (delta.get(a.id) ?? 0),
  }));
}

/** 流水列表查询参数 / Transaction list options */
export type TxListOpts = {
  type?: string; categoryId?: string; q?: string; accountId?: string; projectId?: string;
  startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number; limit?: number; offset?: number;
};

/** 构造流水列表/计数的 SQL 过滤条件（两处共用，避免重复） */
function buildTxConds(ledgerId: string, opts: {
  type?: string; categoryId?: string; q?: string; accountId?: string; projectId?: string;
  startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number;
}): SQL[] {
  const conds: SQL[] = [eq(transactions.ledgerId, ledgerId)];
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
  return conds;
}

/** 流水列表（含分类/账户/项目/标签） */
export async function listTransactions(
  ledgerId: string,
  opts: TxListOpts = {},
) {
  const conds = buildTxConds(ledgerId, opts);
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
export type StatsPeriod = { type: "year" | "month"; year: number; month?: number };

/** 计算统计时间范围 / Resolve stats date range from period */
function resolvePeriodRange(period?: StatsPeriod): { start: string; end: string } {
  if (period?.type === "year") {
    return { start: `${period.year}-01-01`, end: `${period.year}-12-31` };
  }
  const y = period?.year ?? new Date().getFullYear();
  const m = period?.month ?? new Date().getMonth() + 1;
  return monthRange(y, m);
}

export async function dashboardStats(ledgerId: string, period?: StatsPeriod) {
  const accts = await listAccountsWithBalance(ledgerId);
  const now = new Date();

  // 近 6 个月起止（SQL 层过滤，替代全表加载后内存过滤）
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const trendStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(period);

  // 本期流水（SQL 过滤，含笔数统计）
  const periodTxs = await db
    .select({ type: transactions.type, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, periodStart),
      lte(transactions.txDate, periodEnd),
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

  let monthIncome = 0, monthExpense = 0, incomeCount = 0, expenseCount = 0;
  for (const t of periodTxs) {
    if (t.type === "income") { monthIncome += t.amountCents; incomeCount++; }
    if (t.type === "expense") { monthExpense += t.amountCents; expenseCount++; }
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
    incomeCount, expenseCount, totalCount: incomeCount + expenseCount,
    trend, distribution,
    recent,
    totalBalance: accts.reduce((s, a) => s + (a.isAsset ? a.balanceCents : 0), 0),
  };
}

/** 分类占比（按时间范围支出/收入，SQL 层时间过滤） */
export async function categoryBreakdown(ledgerId: string, type: "expense" | "income", period?: StatsPeriod) {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      eq(transactions.type, type),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
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
export async function projectSummary(ledgerId: string, period?: StatsPeriod) {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period);
  const projs = await db.select().from(projects).where(eq(projects.ledgerId, ledgerId));
  const txs = await db
    .select({ projectId: transactions.projectId, type: transactions.type, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      sql`${transactions.projectId} IS NOT NULL`,
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));
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

/** 标签统计（支持时间范围，区分收入/支出） */
export async function tagSummary(ledgerId: string, period?: StatsPeriod) {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period);
  const tgs = await db.select().from(tags).where(eq(tags.ledgerId, ledgerId));
  // 流水查询加时间过滤和 type
  const allTxs = await db
    .select({ id: transactions.id, amountCents: transactions.amountCents, type: transactions.type })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));
  const txIdSet = new Set(allTxs.map((t) => t.id));
  const txInfo = new Map(allTxs.map((t) => [t.id, { amount: t.amountCents, type: t.type }]));
  // 标签关联直接 JOIN 流水，按账本 + 时间范围过滤（在 transaction_tags 上显式加账本过滤，避免跨账本统计）
  const links = await db
    .select({ transactionId: transactionTags.transactionId, tagId: transactionTags.tagId })
    .from(transactionTags)
    .innerJoin(transactions, eq(transactionTags.transactionId, transactions.id))
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));

  const incomeAmt = new Map<string, number>();
  const expenseAmt = new Map<string, number>();
  const incomeCnt = new Map<string, number>();
  const expenseCnt = new Map<string, number>();
  for (const l of links) {
    if (!txIdSet.has(l.transactionId)) continue;
    const tx = txInfo.get(l.transactionId);
    if (!tx) continue;
    if (tx.type === "income") {
      incomeAmt.set(l.tagId, (incomeAmt.get(l.tagId) ?? 0) + tx.amount);
      incomeCnt.set(l.tagId, (incomeCnt.get(l.tagId) ?? 0) + 1);
    } else {
      expenseAmt.set(l.tagId, (expenseAmt.get(l.tagId) ?? 0) + tx.amount);
      expenseCnt.set(l.tagId, (expenseCnt.get(l.tagId) ?? 0) + 1);
    }
  }
  return tgs.map((t) => ({
    ...t,
    incomeCents: incomeAmt.get(t.id) ?? 0,
    expenseCents: expenseAmt.get(t.id) ?? 0,
    incomeCount: incomeCnt.get(t.id) ?? 0,
    expenseCount: expenseCnt.get(t.id) ?? 0,
  }));
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
  opts: Omit<TxListOpts, "limit" | "offset"> = {},
): Promise<number> {
  const conds = buildTxConds(ledgerId, opts);
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
  bond: "国债", foreign_currency: "外币账户", real_estate: "不动产", custom: "自定义",
};

/** 审计日志行（含关联用户昵称/邮箱） / Audit log row with user info */
export type AuditLogRow = {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  requestBody: string | null;
  responseBody: string | null;
  ip: string | null;
  email: string;
  name: string;
  createdAt: string;
};

/** 审计日志查询（分页 + 搜索）；管理员查全部，普通用户仅自己 / List audit logs */
export async function listAuditLogs(opts: {
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AuditLogRow[]; total: number; totalPages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const q = (opts.search ?? "").trim();
  const searchCond = q
    ? or(
        like(auditLogs.summary, `%${q}%`),
        like(auditLogs.entity, `%${q}%`),
        like(auditLogs.action, `%${q}%`),
        like(users.name, `%${q}%`),
        like(users.email, `%${q}%`),
        like(auditLogs.userId, `%${q}%`),
      )
    : undefined;
  const baseWhere = opts.userId
    ? searchCond
      ? and(eq(auditLogs.userId, opts.userId), searchCond)
      : eq(auditLogs.userId, opts.userId)
    : searchCond;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(baseWhere);
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await db
    .select({ log: auditLogs, email: users.email, name: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(baseWhere)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  const data = rows.map((r) => ({
    id: r.log.id,
    userId: r.log.userId,
    action: r.log.action,
    entity: r.log.entity,
    entityId: r.log.entityId,
    summary: r.log.summary,
    requestBody: (r.log as { requestBody?: string | null }).requestBody ?? null,
    responseBody: (r.log as { responseBody?: string | null }).responseBody ?? null,
    ip: (r.log as { ip?: string | null }).ip ?? null,
    email: r.email ?? "-",
    name: r.name ?? "",
    createdAt: r.log.createdAt,
  }));
  return { rows: data, total, totalPages };
}
