import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/db/schema";

/** 默认允许的每页条数 / Default allowed page sizes */
export const DEFAULT_ALLOWED_PAGE_SIZES = [10, 20, 50, 100];
/** 默认每页条数 / Default page size */
export const DEFAULT_PAGE_SIZE_FALLBACK = 20;

/**
 * 从全局设置获取分页配置 / Get pagination config from global settings
 * @returns { allowedPageSizes, defaultPageSize }
 */
export async function getPaginationConfig(): Promise<{
  allowedPageSizes: number[];
  defaultPageSize: number;
}> {
  // 从全局设置读取 allowed_page_sizes 和 default_page_size
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, "global"), eq(settings.key, "allowed_page_sizes")))
    .limit(1);

  const allowedPageSizesStr = rows[0]?.value;
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

  // 读取 default_page_size
  const defaultRows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, "global"), eq(settings.key, "default_page_size")))
    .limit(1);

  const defaultPageSizeStr = defaultRows[0]?.value;
  let defaultPageSize = DEFAULT_PAGE_SIZE_FALLBACK;
  if (defaultPageSizeStr) {
    const n = parseInt(defaultPageSizeStr, 10);
    if (!isNaN(n) && allowedPageSizes.includes(n)) {
      defaultPageSize = n;
    }
  }

  return { allowedPageSizes, defaultPageSize };
}

/**
 * 校验每页条数是否在允许范围内 / Validate page size is within allowed range
 */
export function validatePageSize(pageSize: number, allowedPageSizes: number[]): number {
  return allowedPageSizes.includes(pageSize) ? pageSize : allowedPageSizes[0];
}

// —— 纯函数分页助手（无 DB 依赖，Server / Client 组件共用）——
export {
  parsePage,
  resolvePageSize,
  computeOffset,
  computeTotalPages,
  buildPageWindow,
} from "./pagination-util";
