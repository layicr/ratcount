import { getLocale, getDictionary } from "@/lib/i18n";
import { formatCents } from "@/lib/money";
import { tagSummary, type StatsPeriod } from "@/lib/queries";
import { TimeRangePicker } from "../time-range-picker";
import { CategoryPieChart } from "../category-pie-chart";
import { getPeriodLabel } from "./utils";

export async function TagTab({ ledgerId, period }: { ledgerId: string; period: StatsPeriod }) {
  const locale = await getLocale();
  const d = getDictionary(locale);
  const rows = await tagSummary(ledgerId, period);
  const totalIncome = rows.reduce((s, r) => s + r.incomeCents, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expenseCents, 0);
  const incomePieData = rows.filter((r) => r.incomeCents > 0).map((r) => ({
    category: { name: r.name, icon: "" }, cents: r.incomeCents,
    pct: totalIncome ? Math.round((r.incomeCents / totalIncome) * 1000) / 10 : 0,
  }));
  const expensePieData = rows.filter((r) => r.expenseCents > 0).map((r) => ({
    category: { name: r.name, icon: "" }, cents: r.expenseCents,
    pct: totalExpense ? Math.round((r.expenseCents / totalExpense) * 1000) / 10 : 0,
  }));
  const periodLabel = getPeriodLabel(period, locale, d);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{periodLabel} {d.tags.title}</h2>
        <TimeRangePicker period={period} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CategoryPieChart data={incomePieData} type="income" title={d.reports.tagIncomePie} />
        <CategoryPieChart data={expensePieData} type="expense" title={d.reports.tagExpensePie} />
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.length === 0 && <p className="text-sm text-slate-400">{d.tags.empty}</p>}
        {rows.map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 min-w-[160px]">
            <span className="rounded-full px-2 py-0.5 text-sm font-medium text-white" style={{ background: t.color }}>{t.name}</span>
            <div className="mt-2 space-y-0.5">
              <div className="text-xs text-green-600">+¥ {formatCents(t.incomeCents)} <span className="text-slate-400">({t.incomeCount})</span></div>
              <div className="text-xs text-red-600">-¥ {formatCents(t.expenseCents)} <span className="text-slate-400">({t.expenseCount})</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
