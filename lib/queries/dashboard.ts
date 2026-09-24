/**
 * 仪表盘 / 年度汇总查询 / Dashboard & year-summary queries
 *  - dashboardStats：净资产、本期收支、近 6 月趋势、资产分布、近期流水
 *  - yearSummary：12 个月收支汇总
 * 性能：时间范围下推 SQL；账户余额 / 流水 / 持仓并行查询；趋势与分布用纯函数计算（可单测）
 * Perf: time range pushed to SQL; balances / tx / holdings queried in parallel; trend & distribution via pure functions (testable).
 */
import { transactions, investmentHoldings } from "@/db/schema"
import { TX } from "@/lib/constants"
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";




import { listAccountsWithBalance } from "@/lib/queries/accounts";
import { listTransactions } from "@/lib/queries/transactions";
import { investNetWorthFilter, unrealizedProfitCents } from "@/lib/queries/investments";
import { resolvePeriodRange, type StatsPeriod } from "@/lib/period";
import { investDistKey } from "@/lib/investment-types";
import { localParts } from "@/lib/datetime";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";

/** 近 6 月收支趋势（按 nowTotal 向前补 6 个月，空月补零）/ Last-6-month trend (fill 6 months back from now, zero-pad empty months) */
function buildTrend(
  nowTotal: number,
  trendTxs: { type: string; baseAmountCents: number; txDate: string }[],
): { m: string; income: number; expense: number }[] {
  const trend: { m: string; income: number; expense: number }[] = [];
  const trendMap = new Map<string, { income: number; expense: number }>();
  for (let i = 5; i >= 0; i--) {
    const total = nowTotal - i;
    const key = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    trend.push({ m: key, income: 0, expense: 0 });
    trendMap.set(key, trend[trend.length - 1]);
  }
  for (const t of trendTxs) {
    const slot = trendMap.get(t.txDate.slice(0, 7));
    if (slot) {
      if (t.type === TX.income) slot.income += t.baseAmountCents;
      if (t.type === TX.expense) slot.expense += t.baseAmountCents;
    }
  }
  return trend;
}

/** 资产分布（账户类型 + 投资伪类型 invest_*，避免与账户类型同名冲突），按金额降序 / Asset distribution (account type + invest_ pseudo-type to avoid name clash with account types), sorted by amount desc */
function buildDistribution(
  accts: { type: string; isAsset: boolean; baseBalanceCents: number }[],
  investByType: Map<string, number>,
): { type: string; cents: number; pct: number }[] {
  const dist = new Map<string, number>();
  for (const a of accts) if (a.isAsset && a.baseBalanceCents > 0) {
    dist.set(a.type, (dist.get(a.type) ?? 0) + a.baseBalanceCents);
  }
  for (const [t, v] of investByType) {
    const k = investDistKey(t);
    dist.set(k, (dist.get(k) ?? 0) + v);
  }
  const distTotal = [...dist.values()].reduce((s, x) => s + x, 0);
  return [...dist.entries()].map(([type, v]) => ({
    type,
    cents: v,
    pct: distTotal ? Math.round((v / distTotal) * 1000) / 10 : 0,
  })).sort((a, b) => b.cents - a.cents);
}

/** 仪表盘统计（时间范围下推到 SQL，避免全表加载）/ Dashboard stats (time range pushed to SQL, no full-table load) */
export async function dashboardStats(
  ledgerId: string,
  period?: StatsPeriod,
  opts?: { includeRecent?: boolean },
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  const includeRecent = opts?.includeRecent ?? true;

  // 按用户时区取本地「今天」与「近 6 月起点」，避免服务器时区导致的日界错位 / Use the user's time zone for local "today" and 6-month start, avoiding server-tz day-boundary skew
  const now = localParts(new Date(), timeZone);
  const today = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  const nowTotal = now.year * 12 + (now.month - 1);
  const sixTotal = nowTotal - 5;
  const trendStart = `${Math.floor(sixTotal / 12)}-${String((sixTotal % 12) + 1).padStart(2, "0")}-01`;
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(period, timeZone);

  // 本期 + 近 6 月流水合并为一次查询（范围取并集），内存按用途拆分，避免对 transactions 重复查多次 / Merge this-period + last-6-month tx into one query (union range), split in memory by use, avoiding repeated tx reads
  const rangeStart = periodStart < trendStart ? periodStart : trendStart;
  const rangeEnd = periodEnd > today ? periodEnd : today;
  const txQuery = db
    .select({ type: transactions.type, amountCents: transactions.amountCents, baseAmountCents: transactions.baseAmountCents, txDate: transactions.txDate })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));

  // 并行查询：账户余额、流水、投资持仓互不依赖 / Parallel: balances / tx / holdings are independent
  const [accts, mergedTxs, investRows] = await Promise.all([
    listAccountsWithBalance(ledgerId),
    txQuery,
    db
      .select({
        type: investmentHoldings.type,
        v: investmentHoldings.baseValueCents,
        cost: investmentHoldings.baseCostCents,
        fee: investmentHoldings.baseFeeCents,
      })
      .from(investmentHoldings)
      .where(investNetWorthFilter(ledgerId)),
  ]);
  // 本期/近6月按日期范围拆分（内存过滤，避免重复 SQL）/ Split this-period / 6-month by date range in memory (no duplicate SQL)
  const periodTxs = mergedTxs.filter((t) => t.txDate >= periodStart && t.txDate <= periodEnd);
  const trendTxs = mergedTxs.filter((t) => t.txDate >= trendStart);

  let investmentValue = 0;
  const investByType = new Map<string, number>();
  for (const r of investRows) {
    const v = unrealizedProfitCents(r);
    investmentValue += v;
    if (v > 0) investByType.set(r.type, (investByType.get(r.type) ?? 0) + v);
  }

  // 净资产 = Σ is_asset 基准余额 + Σ 投资未实现盈亏 + Σ 负债（is_asset=false 的信用类）/ Net worth = Σ asset base balances + Σ investment unrealized P&L + Σ liabilities (credit-type, is_asset=false)
  let assets = investmentValue, liabilities = 0;
  for (const a of accts) {
    if (a.isAsset) assets += a.baseBalanceCents;
    else if (a.baseBalanceCents < 0) liabilities += Math.abs(a.baseBalanceCents);
  }
  const netWorth = assets - liabilities;

  let monthIncome = 0, monthExpense = 0, incomeCount = 0, expenseCount = 0;
  for (const t of periodTxs) {
    if (t.type === TX.income) { monthIncome += t.baseAmountCents; incomeCount++; }
    if (t.type === TX.expense) { monthExpense += t.baseAmountCents; expenseCount++; }
  }

  const trend = buildTrend(nowTotal, trendTxs);
  const distribution = buildDistribution(accts, investByType);

  // 近期流水：报表页不需要（includeRecent: false 跳过整表关联查询，只取基础统计）/ Recent tx: reports page skips it (includeRecent:false drops the joined query, returns base stats only)
  const recent = includeRecent ? await listTransactions(ledgerId, { limit: 6 }) : [];

  return {
    netWorth, assets, liabilities,
    monthIncome, monthExpense, monthBalance: monthIncome - monthExpense,
    balanceRate: monthIncome ? Math.round(((monthIncome - monthExpense) / monthIncome) * 1000) / 10 : 0,
    incomeCount, expenseCount, totalCount: incomeCount + expenseCount,
    trend, distribution,
    recent,
    totalBalance: accts.reduce((s, a) => s + (a.isAsset ? a.baseBalanceCents : 0), 0),
  };
}

/** 年度汇总（SQL 层年度过滤，默认按用户时区的本年）/ Year summary (year filter in SQL, default = user-tz current year) */
export async function yearSummary(ledgerId: string, year?: number, timeZone: string = DEFAULT_TIME_ZONE) {
  const y = year ?? localParts(new Date(), timeZone).year;
  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;
  const txs = await db
    .select({ type: transactions.type, baseAmountCents: transactions.baseAmountCents, txDate: transactions.txDate })
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
      if (t.type === TX.income) months[mi - 1].income += t.baseAmountCents;
      if (t.type === TX.expense) months[mi - 1].expense += t.baseAmountCents;
    }
  }
  return months;
}
