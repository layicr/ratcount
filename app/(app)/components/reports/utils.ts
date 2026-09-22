import type { StatsPeriod } from "@/lib/queries";
import type { AppLocale } from "@/i18n/routing";
import { getMonthShortNames } from "@/lib/datetime";

/** 对齐 i18n/routing 的 AppLocale（next-intl 派生） */
type Locale = AppLocale;

/** 服务端模板插值：把 {key} 替换为变量 */
export function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** 计算期间标签（如 "2026年9月" / "Sep 2026"），月份名随 locale 自动变化；t 为全路径 translator */
export function getPeriodLabel(period: StatsPeriod, locale: string, t: (key: string) => string): string {
  const monthName = period.month ? getMonthShortNames(locale as Locale)[period.month - 1] : "";
  return period.type === "year"
    ? fmt(t("reports.periodYear"), { year: period.year })
    : fmt(t("reports.periodMonth"), { year: period.year, month: monthName });
}
