/**
 * 分页纯函数助手（无服务端/DB 依赖，Server 与 Client 组件可共用）
 * 与 lib/pagination.ts 中的 getPaginationConfig（依赖 DB）分离，避免客户端打包被拉入 db。
 * Pagination pure-function helpers (no server/DB deps; shared by Server & Client components)
 * Kept separate from getPaginationConfig (DB-dependent) in lib/pagination.ts so the client bundle won't pull in db.
 */

/** 解析页码：缺失 / 非法 → 1（等价于 Math.max(1, parseInt(x ?? "1", 10) || 1)）/ Parse page number: missing/invalid → 1 */
export function parsePage(raw: string | undefined | null): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 解析并校验每页条数：仅接受全局允许值，否则回退默认 / Parse & validate page size: accept only globally allowed values, else fall back to default */
export function resolvePageSize(
  raw: string | undefined | null,
  allowedPageSizes: number[],
  defaultPageSize: number,
): number {
  const n = parseInt(raw ?? "", 10);
  return allowedPageSizes.includes(n) ? n : defaultPageSize;
}

/** 由页码与每页条数计算 SQL offset / Compute SQL offset from page & page size */
export function computeOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}

/** 由总数与每页条数计算总页数（至少 1）/ Compute total pages from total & page size (min 1) */
export function computeTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil((total || 0) / pageSize));
}

/**
 * 构造分页器所需的数据对象（prev / next / 页码链接由 href 生成）
 * 各列表页原本逐字复制这段对象字面量，收口后消除重复并统一边界行为。
 * @param href 由页码生成链接的函数（服务端预生成，避免把函数传给客户端组件）
 * Build the data object for the pager (prev/next/page links are generated via href).
 * List pages previously copied this object verbatim; centralizing removes duplication and unifies edge behavior.
 * @param href function that builds a link from a page number (pre-generated server-side to avoid passing a fn to the client)
 */
export function buildPager({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions,
  href,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageSizeOptions: number[];
  href: (p: number) => string;
}) {
  return {
    page,
    totalPages,
    total,
    pageSize,
    pageSizeOptions,
    prevHref: href(Math.max(1, page - 1)),
    nextHref: href(Math.min(totalPages, page + 1)),
    pageHrefs: buildPageWindow(page, totalPages).map((p) => ({ page: p, href: href(p) })),
  };
}

/**
 * 计算当前页附近的页码窗口（用于分页器渲染，最多 windowSize 个）
 * 行为与各列表页原有算法一致：当前页居中、两端对齐、不足时从 1 开始。
 * @param page 当前页（>=1）
 * @param totalPages 总页数（>=1）
 * @param windowSize 窗口大小（默认 5）
 * Compute the page-number window around the current page (for the pager, at most windowSize pages).
 * Matches the original per-page algorithm: current page centered, ends aligned, starts at 1 when short.
 * @param page current page (>=1)
 * @param totalPages total pages (>=1)
 * @param windowSize window size (default 5)
 */
export function buildPageWindow(page: number, totalPages: number, windowSize = 5): number[] {
  const safeTotal = Math.max(1, totalPages);
  const size = Math.min(windowSize, safeTotal);
  const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), safeTotal - size + 1));
  return Array.from({ length: size }, (_, i) => start + i);
}

/**
 * 生成保留既有查询参数的分页链接（空值参数自动省略）
 * 供服务端预生成 href 数组，避免把函数传给客户端组件。
 * @param basePath 列表页基础路径，如 /investments/stocks
 * @param params 需要随分页一起保留的查询参数（筛选条件、pageSize 等）
 * @param page 目标页码
 * Build a pagination link that preserves existing query params (empty params omitted).
 * Used server-side to pre-generate href arrays, avoiding passing a fn to the client.
 * @param basePath list page base path, e.g. /investments/stocks
 * @param params query params to keep alongside pagination (filters, pageSize, …)
 * @param page target page number
 */
export function buildPageHref(
  basePath: string,
  params: Record<string, string | number | null | undefined>,
  page: number,
): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  usp.set("page", String(page));
  return `${basePath}?${usp.toString()}`;
}
