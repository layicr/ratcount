/**
 * ratcount · 统计时间段（纯逻辑，无 DB 依赖，可直接单测）
 *  - StatsPeriod：统计粒度（年 / 月）
 *  - resolvePeriodRange：解析为 [start, end] 日期区间（默认按用户时区的本月）
 *  - parsePeriod：解析报表 / 投资页 URL 中的 year-2026 / month-2026-09
 *  - monthKey：按给定时区取本地 YYYY-MM
 * ratcount · stats period (pure logic, no DB dependency, unit-testable)
 *  - StatsPeriod: granularity (year / month)
 *  - resolvePeriodRange: resolve to a [start, end] date range (defaults to this month in the user's timezone)
 *  - parsePeriod: parse the year-2026 / month-2026-09 strings from report/investment URLs
 *  - monthKey: local YYYY-MM in the given timezone
 */
import { localParts, localMonthKey } from "@/lib/datetime";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";
import { monthRange } from "@/lib/sql-utils";
import { type StatsPeriod, STATS_PERIOD, statsPeriodTypes } from "@/lib/constants";

/** 统计时间范围 / Statistics period (type defined in @/lib/constants; re-exported here for import compatibility) */
export type { StatsPeriod };

/** 计算统计时间范围 / Resolve stats date range from period (defaults to this month in the user's timezone) */
export function resolvePeriodRange(
  period?: StatsPeriod,
  timeZone: string = DEFAULT_TIME_ZONE,
): { start: string; end: string } {
  if (period?.type === STATS_PERIOD.year) {
    return { start: `${period.year}-01-01`, end: `${period.year}-12-31` };
  }
  const now = localParts(new Date(), timeZone);
  const y = period?.year ?? now.year;
  const m = period?.month ?? now.month;
  return monthRange(y, m);
}

/** 解析报表/投资页的时间段字符串（year-2026 / month-2026-09），为空或非法时返回 fallback / Parse the report/investment-page period string (year-2026 / month-2026-09); returns fallback when empty or invalid */
export function parsePeriod(str: string | null | undefined, fallback: StatsPeriod): StatsPeriod {
  if (!str) return fallback;
  const m = str.match(new RegExp(`^(${statsPeriodTypes.join("|")})-(\\d{4})(?:-(\\d{2}))?$`));
  if (!m) return fallback;
  const y = parseInt(m[2], 10);
  if (m[1] === STATS_PERIOD.year) return { type: STATS_PERIOD.year, year: y };
  return { type: STATS_PERIOD.month, year: y, month: parseInt(m[3] ?? "01", 10) };
}

/** 本月标识（按给定时区的本地时间，YYYY-MM）/ Current month key in local time (given timezone, YYYY-MM) */
export function monthKey(date: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  return localMonthKey(date, timeZone);
}
