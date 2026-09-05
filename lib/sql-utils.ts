import { sql, type Column } from "drizzle-orm";

/**
 * SQL 工具函数 / SQL utility helpers
 *  - inSql：生成 IN (?, ?, ?) 参数化查询，替代重复的 sql.join 模板
 *  - dateRange：生成日期范围 gte/lte 条件
 */

/** 生成 IN 查询（参数化，防 SQL 注入） / Build IN clause */
export function inSql<T extends Column>(column: T, values: string[]) {
  if (values.length === 0) return sql`1=0`; // 空集合返回假条件
  return sql`${column} IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
}

/** 本月起止日期（本地时间，YYYY-MM-DD） / Month start/end in local time */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month 是 1-based，new Date(year, month, 0) = 上月最后一天
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
