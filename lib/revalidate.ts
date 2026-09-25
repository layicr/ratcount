import { revalidatePath } from "next/cache";
import { DASHBOARD_PATH, TRANSACTIONS_PATH, REPORTS_PATH, BALANCE_PATH, INVESTMENTS_PATH } from "@/lib/constants";
import { investmentListHref } from "@/lib/investment-types";
import { type InvestmentType } from "@/lib/constants";

/**
 * 缓存失效收口（revalidate helpers）
 *  - 流水类写操作影响的页面固定为「流水 / 首页 / 报表 / 余额」四张，
 *    此前在多个 action 内逐字复制，容易出现漏改漂移，统一在此维护
 * Cache-invalidation helpers (single source)
 *  - Transaction writes always touch four pages: transactions / dashboard / reports / balance.
 *    Previously copied verbatim in many actions (drift-prone); centralized here.
 */
export function revalidateTxRelated(): void {
  revalidatePath(TRANSACTIONS_PATH);
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(REPORTS_PATH);
  revalidatePath(BALANCE_PATH);
}

/**
 * 投资写操作影响的页面固定为「投资总览 / 各类型列表 / 首页 / 流水」四张，
 * 此前在 investments action 内逐字复制易漂移，统一在此维护（与 revalidateTxRelated 同模式）。
 * sell/dividend 不传 type（原实现即不刷具体类型列表），其余写操作传入 type 以顺带刷新对应列表。
 * Investment writes touch four pages; centralized to avoid drift (same pattern as revalidateTxRelated).
 */
export function revalidateInvestmentRelated(type?: InvestmentType): void {
  revalidatePath(INVESTMENTS_PATH);
  if (type) revalidatePath(investmentListHref(type));
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(TRANSACTIONS_PATH);
}
