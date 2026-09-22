import { formatCurrency } from "@/lib/money";
import { projectSummary, type StatsPeriod } from "@/lib/queries";
import { TimeRangePicker } from "../time-range-picker";
import { CategoryPieChart } from "../category-pie-chart";
import { getPeriodLabel } from "./utils";
import { getMessages, getLocale } from "next-intl/server";
import { makeDictTranslator, type AppDict } from "@/i18n/dict";
import { PROJECT_STATUS } from "@/lib/constants";

export async function ProjectTab({ ledgerId, period, currency }: { ledgerId: string; period: StatsPeriod; currency: string }) {
  const locale = await getLocale();
  const d = (await getMessages()) as unknown as AppDict;
  const money = (c: number) => formatCurrency(c, currency, locale);
  const rows = await projectSummary(ledgerId, period);
  const totalIncome = rows.reduce((s, r) => s + r.income, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const incomePieData = rows.filter((r) => r.income > 0).map((r) => ({
    category: { name: r.name, icon: r.icon }, cents: r.income,
    pct: totalIncome ? Math.round((r.income / totalIncome) * 1000) / 10 : 0,
  }));
  const expensePieData = rows.filter((r) => r.expense > 0).map((r) => ({
    category: { name: r.name, icon: r.icon }, cents: r.expense,
    pct: totalExpense ? Math.round((r.expense / totalExpense) * 1000) / 10 : 0,
  }));
  const periodLabel = getPeriodLabel(period, locale, makeDictTranslator(d));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{periodLabel} {d.projects.title}</h2>
        <TimeRangePicker period={period} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CategoryPieChart data={incomePieData} type="income" title={d.reports.projectIncomePie} />
        <CategoryPieChart data={expensePieData} type="expense" title={d.reports.projectExpensePie} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2">{d.reports.projectName}</th><th>{d.reports.status}</th><th className="text-right">{d.reports.income}</th>
              <th className="text-right">{d.reports.expense}</th><th className="text-right">{d.reports.balance}</th><th className="text-right">{d.reports.budget}</th><th className="text-right">{d.reports.progress}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{d.common.empty}</td></tr>}
            {rows.map((r) => {
              const pct = r.budgetCents ? Math.round((r.expense / r.budgetCents) * 100) : 0;
              return (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium">{r.icon} {r.name}</td>
                  <td>{r.status === PROJECT_STATUS.active ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{d.projects.active}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{d.projects.completed}</span>}</td>
                  <td className="text-right text-green-600">+{money(r.income)}</td>
                  <td className="text-right text-red-600">-{money(r.expense)}</td>
                  <td className={`text-right font-semibold ${r.balance >= 0 ? "text-slate-800" : "text-red-600"}`}>{money(r.balance)}</td>
                  <td className="text-right text-slate-400">{money(r.budgetCents)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-slate-400">{pct}%</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-teal-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
