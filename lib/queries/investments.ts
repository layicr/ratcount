/**
 * 投资持仓查询 / Investment holding queries
 * 计量口径：买入时已记转账（扣款账户 → 关联账户），成本已体现在账户余额里，
 * 因此净资产只补计「市值 − 成本 − 费用」，避免与账户余额重复计量。
 * Measurement: the buy records a transfer (payer → linked account), so cost is already in the account balance;
 * net worth only adds "market value − cost − fee" to avoid double-counting with account balances.
 */
import { and, asc, count, desc, eq, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { investmentHoldings, holdingTags, tags } from "@/db/schema"
import { listProjects } from "./basics"
import { type InvestmentType } from "@/lib/constants"

import { holdingProfitCents } from "@/lib/investment-flow";
import { resolvePeriodRange, type StatsPeriod } from "@/lib/period";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";

/** 持仓行类型（收紧 any：直接由 schema 推导）/ Holding row type (tightened from any; inferred from schema) */
export type InvestmentRow = typeof investmentHoldings.$inferSelect;

/** 投资总览「持仓明细」最多展示条数（统计口径不受影响，走 SQL 聚合）/ Max rows shown in overview "holding detail" (stats are SQL-aggregated, unaffected) */
const OVERVIEW_DETAIL_LIMIT = 500;

/**
 * 计入净资产/资产分布的投资口径：仅活跃持仓（status = active）。
 * 已卖出 / 已到期 / 已删除的持仓不计（资金已由流水转回账户）。
 * Investments counted in net worth / distribution: active holdings only (status = active).
 * Sold / matured / deleted holdings are excluded (their funds already returned to accounts via tx).
 */
export function investNetWorthFilter(ledgerId: string) {
  return and(
    eq(investmentHoldings.ledgerId, ledgerId),
    eq(investmentHoldings.status, "active"),
  );
}

/** 活跃持仓未实现盈亏（分）：市值 − 成本 − 费用，负数按 0 计 / Active holding unrealized P&L (cents): market − cost − fee, floored at 0 */
export function unrealizedProfitCents(r: { v: number; cost: number; fee: number }): number {
  return Math.max(0, (r.v ?? 0) - (r.cost ?? 0) - (r.fee ?? 0));
}

/**
 * 按买入/起息日期过滤（无买入日期时用创建日期兜底，避免漏数据）
 * 写成 OR 分支而非 COALESCE(...) BETWEEN：COALESCE 会把列包住导致
 * inv_purchase_date_idx 完全失效；改写后 purchase_date 有值的行可命中索引，
 * 仅 purchase_date 为空的少量行回退扫描 created_at（无需改表结构/迁移）
 * Filter by purchase/accrual date (fallback to createdAt when purchaseDate is null, no data loss).
 * Written as OR branches, not COALESCE(...) BETWEEN: COALESCE wraps the column and kills inv_purchase_date_idx;
 * the rewrite keeps the index for rows with purchase_date, scanning created_at only for the few null rows (no migration needed).
 */
function purchaseDateInRange(start: string, end: string): SQL {
  return sql`(${investmentHoldings.purchaseDate} BETWEEN ${start} AND ${end}
    OR (${investmentHoldings.purchaseDate} IS NULL AND substr(${investmentHoldings.createdAt}, 1, 10) BETWEEN ${start} AND ${end}))`;
}

/** 投资未实现盈亏合计（分）：活跃持仓 市值 − 成本 − 费用，用于净资产统计 / Total unrealized P&L (cents): active holdings' market − cost − fee; for net worth */
export async function investmentNetWorthValue(ledgerId: string): Promise<number> {
  const rows = await db
    .select({
      v: investmentHoldings.baseValueCents,
      cost: investmentHoldings.baseCostCents,
      fee: investmentHoldings.baseFeeCents,
    })
    .from(investmentHoldings)
    .where(investNetWorthFilter(ledgerId));
  return rows.reduce((s, r) => s + unrealizedProfitCents(r), 0);
}

/**
 * 投资总览：按买入/起息日期过滤后按类型聚合（统计卡片、分类卡、明细列表同源）
 * 一次查询全量持仓后内存聚合，避免按类型各查一次
 * Investment overview: filter by purchase date, then aggregate by type (stat cards, type cards, detail list share one source).
 * One query for all holdings, then aggregate in memory — no per-type queries.
 */
export async function investmentOverview(ledgerId: string, period?: StatsPeriod, timeZone: string = DEFAULT_TIME_ZONE) {
  const { start, end } = resolvePeriodRange(period, timeZone);
  const inRange = and(
    eq(investmentHoldings.ledgerId, ledgerId),
    ne(investmentHoldings.status, "deleted"),
    purchaseDateInRange(start, end),
  );

  // 统计口径下推 SQL：按类型 GROUP BY 出「数量 / 成本 / 费用 / 市值 / 派息」/ Push stats to SQL: GROUP BY type for count/cost/fee/value/dividend
  const aggRows = await db
    .select({
      type: investmentHoldings.type,
      cnt: count(),
      cost: sql<number>`coalesce(sum(${investmentHoldings.baseCostCents}), 0)`,
      fee: sql<number>`coalesce(sum(${investmentHoldings.baseFeeCents}), 0)`,
      value: sql<number>`coalesce(sum(${investmentHoldings.baseValueCents}), 0)`,
      dividend: sql<number>`coalesce(sum(${investmentHoldings.baseDividendCents}), 0)`,
    })
    .from(investmentHoldings)
    .where(inRange)
    .groupBy(investmentHoldings.type);

  const byType: Record<string, { count: number; cost: number; fee: number; value: number; dividend: number; profit: number }> = {};
  let totalCost = 0, totalFee = 0, totalValue = 0, totalDividend = 0, totalCount = 0;
  for (const r of aggRows) {
    const cost = Number(r.cost), fee = Number(r.fee), value = Number(r.value), dividend = Number(r.dividend);
    byType[r.type] = {
      count: Number(r.cnt),
      cost, fee, value, dividend,
      // 收益口径：浮盈（市值 − 成本 − 费用）+ 累计派息（派息时市值已除权，故不重复计）/ Profit: floating gain (value−cost−fee) + cumulative dividends (ex-div already priced in, not double-counted)
      profit: holdingProfitCents({ valueCents: value, costCents: cost, feeCents: fee, dividendCents: dividend }),
    };
    totalCost += cost;
    totalFee += fee;
    totalValue += value;
    totalDividend += dividend;
    totalCount += Number(r.cnt);
  }

  // 明细列表：只取市值最高的前 N 条用于页面展示，避免大账本把全部持仓下发/渲染 / Detail list: top-N by value only, so large ledgers don't send/render every holding
  const holdings = await db
    .select()
    .from(investmentHoldings)
    .where(inRange)
    .orderBy(desc(investmentHoldings.currentValueCents))
    .limit(OVERVIEW_DETAIL_LIMIT);

  return {
    totalValue,
    totalCost,
    totalFee,
    totalDividend,
    totalProfit: holdingProfitCents({
      valueCents: totalValue,
      costCents: totalCost,
      feeCents: totalFee,
      dividendCents: totalDividend,
    }),
    totalCount,
    byType,
    holdings,
  };
}

/** 按投资类型查询持仓（可按细分 / 期间 / 关键词过滤，分页，按市值降序）/ List holdings by type (filter by subType/period/keyword; paginated; sorted by value desc) */
export async function listInvestmentsByType(
  ledgerId: string,
  type: InvestmentType,
  opts?: { subType?: string; period?: StatsPeriod; q?: string; page?: number; pageSize?: number; dateFrom?: string; dateTo?: string },
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<{ rows: InvestmentRow[]; total: number }> {
  const conds: SQL[] = [
    eq(investmentHoldings.ledgerId, ledgerId),
    eq(investmentHoldings.type, type),
    ne(investmentHoldings.status, "deleted"),
  ];
  if (opts?.subType) conds.push(eq(investmentHoldings.subType, opts.subType));
  if (opts?.period) {
    const { start, end } = resolvePeriodRange(opts.period, timeZone);
    conds.push(purchaseDateInRange(start, end));
  }
  if (opts?.q) {
    const pattern = `%${opts.q}%`;
    conds.push(or(like(investmentHoldings.name, pattern), like(investmentHoldings.code, pattern)) as SQL);
  }
  // 买入日期区间：from / to 可只填一侧，未填侧取极值 / Purchase-date range: from/to may be one-sided; the empty side uses extremes
  if (opts?.dateFrom || opts?.dateTo) {
    conds.push(purchaseDateInRange(opts.dateFrom || "0000-01-01", opts.dateTo || "9999-12-31"));
  }
  const where = and(...conds);
  const [{ total }] = await db
    .select({ total: count() })
    .from(investmentHoldings)
    .where(where);
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.max(1, opts?.pageSize ?? 20);
  const rows = await db
    .select()
    .from(investmentHoldings)
    .where(where)
    .orderBy(desc(investmentHoldings.currentValueCents))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total };
}

/**
 * 持仓标签（列表展示 / 编辑回显）：持仓 ID → 标签数组（按标签名排序）
 * 仅返回本账本标签，防止跨账本标签名/颜色泄露
 * Holding tags (list display / edit echo): holding ID → tag array (sorted by tag name).
 * Returns only this ledger's tags, preventing cross-ledger tag name/color leaks.
 */
export async function listHoldingTags(
  ledgerId: string,
  holdingIds: string[],
): Promise<Map<string, { id: string; name: string; color: string }[]>> {
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  if (holdingIds.length === 0) return map;
  const rows = await db
    .select({ holdingId: holdingTags.holdingId, id: tags.id, name: tags.name, color: tags.color })
    .from(holdingTags)
    .innerJoin(tags, eq(tags.id, holdingTags.tagId))
    .where(and(inArray(holdingTags.holdingId, holdingIds), eq(tags.ledgerId, ledgerId)))
    .orderBy(asc(tags.name));
  for (const r of rows) {
    const item = { id: r.id, name: r.name, color: r.color };
    const list = map.get(r.holdingId);
    if (list) list.push(item);
    else map.set(r.holdingId, [item]);
  }
  return map;
}

/**
 * 持仓行 → 附带标签与项目（列表展示用）
 * 一次批量取标签 + 项目后内存拼装，避免每行查询（N+1）
 * Holding row → with tags & project (list display).
 * Fetch tags + projects in one batch, then assemble in memory — no per-row query (N+1).
 */
export async function attachHoldingMeta<T extends { id: string; projectId: string | null }>(
  ledgerId: string,
  rows: T[],
): Promise<
  (T & {
    tags: { id: string; name: string; color: string }[];
    project?: { id: string; name: string; icon: string };
  })[]
> {
  const [tagMap, projects] = await Promise.all([
    listHoldingTags(ledgerId, rows.map((r) => r.id)),
    listProjects(ledgerId),
  ]);
  const projMap = new Map(projects.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
    project: r.projectId ? projMap.get(r.projectId) : undefined,
  }));
}

/** 单条投资持仓（编辑回显）/ Single holding (edit echo) */
export async function getInvestmentById(id: string, ledgerId: string) {
  const [row] = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId)))
    .limit(1);
  return row ?? null;
}
