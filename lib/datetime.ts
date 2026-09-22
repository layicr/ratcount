/**
 * ratcount · 本地化日期/星期名（基于 Intl，随 locale 自动变化）
 *  - 替代各组件中写死的 MONTHS_ZH / MONTHS_EN / weekNames 等语言分支
 *  - locale 直接传给 Intl.DateTimeFormat（zh / en / zh-TW 均为合法 BCP 47 标签，无需映射）
 *  - 新增语言由 Intl 自动处理，无需改此处
 * ratcount · localized date/weekday names (Intl-based, auto-adjusts per locale)
 *  - Replaces hardcoded MONTHS_ZH / MONTHS_EN / weekNames branches in components
 *  - Pass locale straight to Intl.DateTimeFormat (zh / en / zh-TW are all valid BCP 47 tags, no mapping needed)
 *  - New languages are handled automatically by Intl; no change required here
 */
import type { AppLocale } from "@/i18n/routing";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";

/** 对齐 i18n/routing 的 AppLocale（next-intl 派生，替代已删除的 lib/i18n.ts shim 类型）/ Aligns with i18n/routing's AppLocale (next-intl derived; replaces the removed lib/i18n.ts shim type) */
type Locale = AppLocale;

/**
 * 给定时区，取某个时刻在该时区下的本地年/月/日（数字）。
 * 用于按用户时区计算「今天 / 本月 / 近 N 月」，替代 new Date() 的服务器本地时区，
 * 避免跨时区用户在日界附近看到错误的默认周期。
 * Given a timezone, get the local year/month/day (numbers) of a moment in that zone.
 * Used to compute "today / this month / last N months" in the user's timezone instead of the server's local zone,
 * avoiding wrong default periods near day boundaries for cross-timezone users.
 */
export function localParts(
  d: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const num = (t: string) => Number(get(t));
  return { year: num("year"), month: num("month"), day: num("day") };
}

/** 给定时区，取本地日期 YYYY-MM-DD（默认此刻）/ Local date YYYY-MM-DD in the given timezone (default now) */
export function localDateKey(d: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  const { year, month, day } = localParts(d, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 给定时区，取本地月份标识 YYYY-MM（默认此刻）/ Local month key YYYY-MM in the given timezone (default now) */
export function localMonthKey(d: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  const { year, month } = localParts(d, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 短月名（1月..12月 / Jan..Dec / 1月(繁)），随 locale 变化 / Short month names (Jan..Dec etc.), locale-dependent */
export function getMonthShortNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale as Locale, { month: "short" });
  // 2024 为闰年无关，仅取 1-12 月名称 / Leap year is irrelevant; just take month names 1-12
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
}

/** 周一为首的短星期名（一..日 / Mon..Sun / 一..日(繁)）/ Short weekday names, Monday-first (Mon..Sun) */
export function getWeekdayShortNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale as Locale, { weekday: "short" });
  const base = new Date(2023, 0, 2); // 2023-01-02 是周一 / 2023-01-02 is a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return fmt.format(d);
  });
}

/** 周日为首的短星期名（日..六 / Sun..Sat / 日..六(繁)），用于「星期几」下拉 / Short weekday names, Sunday-first (Sun..Sat), for the "weekday" dropdown */
export function getWeekdayShortNamesSundayFirst(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale as Locale, { weekday: "short" });
  const base = new Date(2023, 0, 1); // 2023-01-01 是周日 / 2023-01-01 is a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return fmt.format(d);
  });
}
