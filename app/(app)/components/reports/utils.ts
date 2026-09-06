import type { StatsPeriod } from "@/lib/queries";

/** 服务端模板插值：把 {key} 替换为变量 */
export function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export const MONTHS_ZH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 计算期间标签（如 "2026年九月" / "September 2026"） */
export function getPeriodLabel(period: StatsPeriod, locale: string, d: { reports: Record<string, string> }): string {
  const months = locale === "en" ? MONTHS_EN : MONTHS_ZH;
  const monthName = period.month ? months[period.month - 1] : "";
  return period.type === "year"
    ? fmt(d.reports.periodYear, { year: period.year })
    : fmt(d.reports.periodMonth, { year: period.year, month: monthName });
}

/** 账户类型 → i18n key（snake_case → camelCase） */
export const typeKey: Record<string, string> = {
  cash: "cash", debit_card: "debitCard", credit_card: "creditCard", wechat: "wechat",
  savings: "savings", investment: "investment", fund: "fund", precious_metal: "preciousMetal",
  bond: "bond", foreign_currency: "foreignCurrency", real_estate: "realEstate", custom: "custom",
};
