import { eq, and, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { settings } from "@/db/schema"
import { GLOBAL_USER_ID, SETTING_KEY } from "@/lib/constants"



/** 默认允许的每页条数 / Default allowed page sizes */
export const DEFAULT_ALLOWED_PAGE_SIZES = [10, 20, 50, 100];
/** 默认每页条数 / Default page size */
export const DEFAULT_PAGE_SIZE_FALLBACK = 20;

/**
 * 从全局设置获取分页配置 / Get pagination config from global settings
 * React cache() 包裹：同一请求内多次调用只查一次库；inArray 一次取两行。
 * Wrapped in React cache(): one DB read per request; inArray fetches both rows at once.
 * 返回 { allowedPageSizes, defaultPageSize }。
 * Returns { allowedPageSizes, defaultPageSize }.
 */
export const getPaginationConfig = cache(async (): Promise<{
  allowedPageSizes: number[];
  defaultPageSize: number;
}> => {
  // 从全局设置一次读取 allowed_page_sizes 和 default_page_size / Read both allowed_page_sizes and default_page_size in one go
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(
      eq(settings.userId, GLOBAL_USER_ID),
      inArray(settings.key, [SETTING_KEY.allowedPageSizes, SETTING_KEY.defaultPageSize]),
    ))
    .limit(10);

  const rowOf = (key: string) => rows.find((r) => r.key === key)?.value;

  const allowedPageSizesStr = rowOf(SETTING_KEY.allowedPageSizes);
  let allowedPageSizes = DEFAULT_ALLOWED_PAGE_SIZES;
  if (allowedPageSizesStr) {
    const parsed = allowedPageSizesStr
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0 && n <= 1000);
    if (parsed.length > 0) {
      allowedPageSizes = parsed.sort((a, b) => a - b);
    }
  }

  const defaultPageSizeStr = rowOf(SETTING_KEY.defaultPageSize);
  let defaultPageSize = DEFAULT_PAGE_SIZE_FALLBACK;
  if (defaultPageSizeStr) {
    const n = parseInt(defaultPageSizeStr, 10);
    if (!isNaN(n) && allowedPageSizes.includes(n)) {
      defaultPageSize = n;
    }
  }

  return { allowedPageSizes, defaultPageSize };
});

/**
 * 校验每页条数是否在允许范围内 / Validate page size is within allowed range
 */
export function validatePageSize(pageSize: number, allowedPageSizes: number[]): number {
  return allowedPageSizes.includes(pageSize) ? pageSize : allowedPageSizes[0];
}

// 纯函数分页助手（无 DB 依赖，Server / Client 组件共用）/ Pure-function pagination helpers (no DB dependency; shared by Server / Client components)
export {
  parsePage,
  resolvePageSize,
  computeOffset,
  computeTotalPages,
  buildPageWindow,
  buildPageHref,
  buildPager,
} from "./pagination-util";
