import { getLocale, getDictionary } from "@/lib/i18n";
import { formatCents } from "@/lib/money";
import { dashboardStats, yearSummary, type StatsPeriod } from "@/lib/queries";
import { TimeRangePicker } from "../time-range-picker";
import { MonthlyTrendChart } from "../monthly-trend-chart";
import { Card } from "./card";
import { fmt, getPeriodLabel } from "./utils";

export async function Overview({ s, period, yearTrend }: { s: Awaited<ReturnType<typeof dashboardStats>>; period: StatsPeriod; yearTrend: Awaited<ReturnType<typeof yearSummary>> }) {
  const locale = await getLocale();
  const d = getDictionary(locale);
  const periodLabel = getPeriodLabel(period, locale, d);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{periodLabel} {d.reports.overview}</h2>
        <TimeRangePicker period={period} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label={d.dashboard.netWorth} value={`¥ ${formatCents(s.netWorth)}`} />
        <Card label={fmt(d.dashboard.incomeWithCount, { count: s.incomeCount })} value={`+¥ ${formatCents(s.monthIncome)}`} tone="text-green-600" />
        <Card label={fmt(d.dashboard.expenseWithCount, { count: s.expenseCount })} value={`-¥ ${formatCents(s.monthExpense)}`} tone="text-red-600" />
        <Card label={`${d.reports.balance} / ${d.dashboard.balanceRate}`} value={`¥ ${formatCents(s.monthBalance)}`} sub={`${s.balanceRate}%`} />
        <Card label={d.reports.txCount} value={fmt(d.reports.txCountValue, { count: s.totalCount })} sub={fmt(d.reports.txCountSub, { income: s.incomeCount, expense: s.expenseCount })} />
      </div>
      <MonthlyTrendChart data={yearTrend} />
    </div>
  );
}
