import Link from "next/link";
import { formatCurrency } from "@/lib/money";
import { categoryBreakdown, type StatsPeriod } from "@/lib/queries";
import { TimeRangePicker } from "../time-range-picker";
import { CategoryPieChart } from "../category-pie-chart";
import { getPeriodLabel } from "./utils";
import { BAR_COLORS } from "@/lib/chart-colors";
import { getMessages, getLocale } from "next-intl/server";
import { makeDictTranslator, type AppDict } from "@/i18n/dict";
import { TX } from "@/lib/constants";

export async function CategoryTab({ ledgerId, catType, period, currency }: { ledgerId: string; catType: string; period: StatsPeriod; currency: string }) {
  const locale = await getLocale();
  const d = (await getMessages()) as unknown as AppDict;
  const type = catType === TX.income ? TX.income : TX.expense;
  const rows = await categoryBreakdown(ledgerId, type, period);
  const total = rows.reduce((sum, r) => sum + r.cents, 0);
  const periodStr = period.type === "year" ? `year-${period.year}` : `month-${period.year}-${String(period.month ?? 1).padStart(2, "0")}`;
  const periodLabel = getPeriodLabel(period, locale, makeDictTranslator(d));
  const money = (c: number) => formatCurrency(c, currency, locale);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">{periodLabel}</h2>
          <div className="flex gap-1 rounded-xl bg-white border border-slate-200 p-1 w-fit">
            {[[TX.expense, d.common.expense], [TX.income, d.common.income]].map(([v, l]) => (
              <Link key={v} href={`/reports?tab=category&catType=${v}&period=${periodStr}`} className={`rounded-lg px-3 py-1.5 text-sm ${type === v ? "bg-teal-600 text-white" : "text-slate-500"}`}>{l}</Link>
            ))}
          </div>
        </div>
        <TimeRangePicker period={period} />
      </div>
      <CategoryPieChart data={rows} type={type} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {type === TX.expense ? d.reports.expenseCat : d.reports.incomeCat}（{d.common.total} {money(total)}）
        </h2>
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{d.common.empty}</p> : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={r.category?.id}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    <span className="mr-4 inline-block w-5 text-right text-sm font-bold text-slate-500">{i + 1}</span>
                    <span className="mr-1">{r.category?.icon ?? "📂"}</span>
                    {r.category?.name ?? d.reports.unclassified}
                  </span>
                  <span className="text-slate-400">{money(r.cents)} · {r.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, r.pct)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
