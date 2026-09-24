import { revalidatePath } from "next/cache";
import { DASHBOARD_PATH, TRANSACTIONS_PATH, REPORTS_PATH, BALANCE_PATH } from "@/lib/constants";

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
