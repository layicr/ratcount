/**
 * 分页纯函数助手（无服务端/DB 依赖，Server 与 Client 组件可共用）
 * 与 lib/pagination.ts 中的 getPaginationConfig（依赖 DB）分离，避免客户端打包被拉入 db。
 */

/** 解析页码：缺失 / 非法 → 1（等价于 Math.max(1, parseInt(x ?? "1", 10) || 1)） */
export function parsePage(raw: string | undefined | null): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 解析并校验每页条数：仅接受全局允许值，否则回退默认 */
export function resolvePageSize(
  raw: string | undefined | null,
  allowedPageSizes: number[],
  defaultPageSize: number,
): number {
  const n = parseInt(raw ?? "", 10);
  return allowedPageSizes.includes(n) ? n : defaultPageSize;
}

/** 由页码与每页条数计算 SQL offset */
export function computeOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}

/** 由总数与每页条数计算总页数（至少 1） */
export function computeTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil((total || 0) / pageSize));
}

/**
 * 计算当前页附近的页码窗口（用于分页器渲染，最多 windowSize 个）
 * 行为与各列表页原有算法一致：当前页居中、两端对齐、不足时从 1 开始。
 * @param page 当前页（>=1）
 * @param totalPages 总页数（>=1）
 * @param windowSize 窗口大小（默认 5）
 */
export function buildPageWindow(page: number, totalPages: number, windowSize = 5): number[] {
  const safeTotal = Math.max(1, totalPages);
  const size = Math.min(windowSize, safeTotal);
  const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), safeTotal - size + 1));
  return Array.from({ length: size }, (_, i) => start + i);
}
