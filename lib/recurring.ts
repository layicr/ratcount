/**
 * 周期计划 · 日期推进纯函数（lib/recurring.ts）
 *  - 与 UI/DB 解耦，便于单元测试
 *  - 返回 YYYY-MM-DD 字符串，基于 UTC 计算避免时区偏移
 * Recurring plan — pure date-advance functions (lib/recurring.ts)
 *  - Decoupled from UI/DB for easy unit testing
 *  - Returns YYYY-MM-DD strings; computed in UTC to avoid timezone drift
 */
import { type RecurringFrequency, FREQ } from "@/lib/constants";

/** 解析 YYYY-MM-DD → UTC Date（本地时区无关）/ Parse YYYY-MM-DD → UTC Date (timezone-independent) */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Date → YYYY-MM-DD / Date → YYYY-MM-DD */
export function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 某年某月的最后一天（1-31）/ Last day of a given year/month (1-31) */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 计算下一次执行日期（在 fromDate 基础上推进一个周期）
 *  - daily：+1 天
 *  - weekly：+7 天（dayOfWeek 指定时跳到目标星期几）
 *  - monthly：下月 dayOfMonth 日（默认用 from 的日；超月取月末）
 *  - yearly：下一年同日（2/29 → 2/28）
 * Compute the next run date (advance one cycle from fromDate)
 *  - daily: +1 day
 *  - weekly: +7 days (or jump to the target weekday when dayOfWeek is given)
 *  - monthly: the dayOfMonth of next month (defaults to from's day; clamps to month-end if exceeded)
 *  - yearly: same day next year (2/29 → 2/28)
 */
export function nextRecurringDate(
  freq: RecurringFrequency,
  fromDate: string,
  opts: { dayOfMonth?: number | null; dayOfWeek?: number | null } = {},
): string {
  const base = parseDate(fromDate);
  if (freq === FREQ.daily) {
    return fmtDate(new Date(base.getTime() + 86400000));
  }
  if (freq === FREQ.weekly) {
    const target = opts.dayOfWeek ?? base.getUTCDay();
    const cur = base.getUTCDay();
    let diff = target - cur;
    if (diff <= 0) diff += 7;
    return fmtDate(new Date(base.getTime() + diff * 86400000));
  }
  if (freq === FREQ.monthly) {
    const day = opts.dayOfMonth ?? base.getUTCDate();
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth() + 1; // 1-12
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const last = lastDayOfMonth(nextYear, nextMonth);
    return fmtDate(new Date(Date.UTC(nextYear, nextMonth - 1, Math.min(day, last))));
  }
  // yearly
  const y = base.getUTCFullYear() + 1;
  const m = base.getUTCMonth() + 1;
  const day = base.getUTCDate();
  const last = lastDayOfMonth(y, m);
  return fmtDate(new Date(Date.UTC(y, m - 1, Math.min(day, last))));
}
