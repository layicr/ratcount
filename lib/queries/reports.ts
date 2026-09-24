/**
 * 报表聚合查询 / Report aggregation queries
 *  - categoryBreakdown：分类占比（按时间范围支出/收入）
 *  - projectSummary：项目盈亏
 *  - tagSummary：标签统计（区分收入/支出）
 * 共性：时间范围过滤下推到 SQL，分组用 Map O(n)，替代嵌套 filter O(n*m)
 * Common: time-range filter pushed to SQL; grouping via Map O(n) instead of nested filter O(n*m).
 */
import { projects, tags, transactionTags, transactions, categories, investmentHoldings } from "@/db/schema"
import { TX, INVESTMENT_STATUS, type CategoryType } from "@/lib/constants"
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";




import { resolvePeriodRange, type StatsPeriod } from "@/lib/period";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";

/** 分类占比（按时间范围支出/收入，SQL 层时间过滤）/ Category breakdown (by time range, expense/income; time filter in SQL) */
export async function categoryBreakdown(ledgerId: string, type: CategoryType, period?: StatsPeriod, timeZone: string = DEFAULT_TIME_ZONE) {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period, timeZone);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      amountCents: transactions.amountCents,
      baseAmountCents: transactions.baseAmountCents,
    })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      eq(transactions.type, type),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));
  const cats = await db.select().from(categories).where(eq(categories.ledgerId, ledgerId));
  const catsById = new Map(cats.map((c) => [c.id, c]));
  const map = new Map<string, number>();
  for (const r of rows) if (r.categoryId) map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + r.baseAmountCents);
  const total = [...map.values()].reduce((s, x) => s + x, 0);
  return [...map.entries()].map(([id, v]) => ({
    category: catsById.get(id), // 预构建 Map，替代 O(n*m) 的 find / prebuilt Map instead of O(n*m) find
    cents: v,
    pct: total ? Math.round((v / total) * 1000) / 10 : 0,
  })).sort((a, b) => b.cents - a.cents);
}

/** 项目盈亏（Map 分组 O(n)，替代嵌套 filter O(n*m)）/ Project P&L (Map grouping O(n), not nested filter O(n*m)) */
export type ProjectSummaryRow = {
  id: string; name: string; icon: string; status: string; remark: string | null;
  budgetCents: number;
  income: number; expense: number; balance: number;
  /** 关联持仓（status=active）基准口径汇总 / linked active holdings, base-currency totals */
  investCost: number; investValue: number; investProfit: number;
  /** 原币组成（交易收支净额 + 持仓市值，按 currencyCode 分组）；仅多币种时展示 / native composition by currency; shown only when multi-currency */
  nativeBreakdown: { currency: string; amountCents: number }[];
};

export async function projectSummary(ledgerId: string, period?: StatsPeriod, timeZone: string = DEFAULT_TIME_ZONE): Promise<ProjectSummaryRow[]> {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period, timeZone);
  const projs = await db.select().from(projects).where(eq(projects.ledgerId, ledgerId));
  const txs = await db
    .select({
      projectId: transactions.projectId, type: transactions.type,
      amountCents: transactions.amountCents, baseAmountCents: transactions.baseAmountCents,
      currencyCode: transactions.currencyCode,
    })
    .from(transactions)
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      sql`${transactions.projectId} IS NOT NULL`,
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ));
  // 关联持仓（当前快照，不按时间范围过滤）/ linked holdings (current snapshot, not period-bound)
  const holds = await db
    .select({
      projectId: investmentHoldings.projectId, currencyCode: investmentHoldings.currencyCode,
      baseCostCents: investmentHoldings.baseCostCents, baseValueCents: investmentHoldings.baseValueCents,
      currentValueCents: investmentHoldings.currentValueCents,
    })
    .from(investmentHoldings)
    .where(and(
      eq(investmentHoldings.ledgerId, ledgerId),
      eq(investmentHoldings.status, INVESTMENT_STATUS.active),
      sql`${investmentHoldings.projectId} IS NOT NULL`,
    ));

  // 一次遍历分组到 Map（O(n)）+ 原币按币种累计 / Single pass into Maps (O(n)) + native accumulation by currency
  const stats = new Map<string, { income: number; expense: number }>();
  const invest = new Map<string, { cost: number; value: number }>();
  const native = new Map<string, Map<string, number>>();
  const addNative = (pid: string | null, cur: string | null, amt: number) => {
    if (!pid || !cur || amt === 0) return;
    let m = native.get(pid);
    if (!m) { m = new Map(); native.set(pid, m); }
    m.set(cur, (m.get(cur) ?? 0) + amt);
  };

  for (const t of txs) {
    if (!t.projectId) continue;
    const s = stats.get(t.projectId) ?? { income: 0, expense: 0 };
    if (t.type === TX.income) s.income += t.baseAmountCents;
    if (t.type === TX.expense) s.expense += t.baseAmountCents;
    stats.set(t.projectId, s);
    // 原币收支净额（transfer 不计入，与 projectSummary 口径一致）/ native net (transfers excluded, consistent with summary)
    addNative(t.projectId, t.currencyCode, t.type === TX.income ? t.amountCents : t.type === TX.expense ? -t.amountCents : 0);
  }
  for (const h of holds) {
    if (!h.projectId) continue;
    const v = invest.get(h.projectId) ?? { cost: 0, value: 0 };
    v.cost += h.baseCostCents;
    v.value += h.baseValueCents;
    invest.set(h.projectId, v);
    // 原币市值（正）/ native market value (positive)
    addNative(h.projectId, h.currencyCode, h.currentValueCents);
  }

  return projs.map((p) => {
    const s = stats.get(p.id) ?? { income: 0, expense: 0 };
    const iv = invest.get(p.id) ?? { cost: 0, value: 0 };
    const nb = native.get(p.id);
    const nativeBreakdown = nb
      ? [...nb.entries()].filter(([, a]) => a !== 0).map(([currency, amountCents]) => ({ currency, amountCents }))
      : [];
    return {
      ...p,
      income: s.income, expense: s.expense, balance: s.income - s.expense,
      investCost: iv.cost, investValue: iv.value, investProfit: iv.value - iv.cost,
      nativeBreakdown,
    };
  });
}

/** 标签统计（支持时间范围，区分收入/支出）/ Tag stats (time range; income vs expense) */
export async function tagSummary(ledgerId: string, period?: StatsPeriod, timeZone: string = DEFAULT_TIME_ZONE) {
  const { start: rangeStart, end: rangeEnd } = resolvePeriodRange(period, timeZone);
  const tgs = await db.select().from(tags).where(eq(tags.ledgerId, ledgerId));
  // 聚合下推 SQL：按「标签 × 收支类型」分组求和/计数，
  // 避免把区间内全部流水行（INNER JOIN 后行数 = 标签关联数）拉进 Node 内存再聚合
  // Push aggregation to SQL: GROUP BY tag × type for sum/count, so we don't pull every tx row (rows = tag links after INNER JOIN) into Node memory.
  const rows = await db
    .select({
      tagId: transactionTags.tagId,
      type: transactions.type,
      sum: sql<number>`coalesce(sum(${transactions.baseAmountCents}), 0)`,
      cnt: count(),
    })
    .from(transactionTags)
    .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.txDate, rangeStart),
      lte(transactions.txDate, rangeEnd),
    ))
    .groupBy(transactionTags.tagId, transactions.type);

  const incomeAmt = new Map<string, number>();
  const expenseAmt = new Map<string, number>();
  const incomeCnt = new Map<string, number>();
  const expenseCnt = new Map<string, number>();
  for (const r of rows) {
    const sum = Number(r.sum);
    const cnt = Number(r.cnt);
    // 收入计入 income，其余（支出 / 转账）与原实现一致计入 expense，累加而非覆盖 / Income → income; others (expense/transfer) → expense as before; accumulate, don't overwrite
    if (r.type === TX.income) {
      incomeAmt.set(r.tagId, (incomeAmt.get(r.tagId) ?? 0) + sum);
      incomeCnt.set(r.tagId, (incomeCnt.get(r.tagId) ?? 0) + cnt);
    } else {
      expenseAmt.set(r.tagId, (expenseAmt.get(r.tagId) ?? 0) + sum);
      expenseCnt.set(r.tagId, (expenseCnt.get(r.tagId) ?? 0) + cnt);
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
