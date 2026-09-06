import { getLocale, getDictionary } from "@/lib/i18n";
import { formatCents } from "@/lib/money";
import { dashboardStats, listAccountsWithBalance, type StatsPeriod } from "@/lib/queries";
import { TimeRangePicker } from "../time-range-picker";
import { fmt, getPeriodLabel, typeKey } from "./utils";

/** 进度条每行颜色 */
const BAR_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#f43f5e",
  "#84cc16", "#06b6d4",
];

/** 账户类型 → 图标 */
const TYPE_ICON: Record<string, string> = {
  cash: "💵", debit_card: "💳", credit_card: "💳", wechat: "💬",
  savings: "🏦", investment: "📈", fund: "📊", precious_metal: "🥇",
  bond: "📜", foreign_currency: "💱", real_estate: "🏠", custom: "📦",
};

export async function AssetTab({ ledgerId, period, s }: { ledgerId: string; period: StatsPeriod; s: Awaited<ReturnType<typeof dashboardStats>> }) {
  const locale = await getLocale();
  const d = getDictionary(locale);
  const accts = await listAccountsWithBalance(ledgerId);
  const assetAccts = accts.filter((a) => a.isAsset).sort((a, b) => b.balanceCents - a.balanceCents);
  const totalAsset = assetAccts.reduce((sum, a) => sum + a.balanceCents, 0);
  const periodLabel = getPeriodLabel(period, locale, d);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{periodLabel} {d.reports.asset}</h2>
        <TimeRangePicker period={period} />
      </div>
      {/* 资产分布 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{fmt(d.reports.assetDist, { total: formatCents(s.assets) })}</h2>
        {s.distribution.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{d.reports.noData}</p> : (
          <div className="space-y-3">
            {s.distribution.map((dist, i) => (
              <div key={dist.type}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    <span className="mr-4 inline-block w-5 text-right text-sm font-bold text-slate-500">{i + 1}</span>
                    <span className="mr-1">{TYPE_ICON[dist.type] ?? "📦"}</span>
                    {(d.acctType as Record<string, string>)[typeKey[dist.type]] ?? dist.type}
                  </span>
                  <span className="text-slate-400">¥ {formatCents(dist.cents)} · {dist.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, dist.pct)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 资产明细 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{d.reports.assetDetail}</h2>
        {assetAccts.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{d.reports.noData}</p> : (
          <div className="space-y-3">
            {assetAccts.map((a, i) => {
              const pct = totalAsset ? Math.round((a.balanceCents / totalAsset) * 1000) / 10 : 0;
              return (
                <div key={a.id}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      <span className="mr-4 inline-block w-5 text-right text-sm font-bold text-slate-500">{i + 1}</span>
                      <span className="mr-1">{a.icon}</span>
                      {a.name}
                    </span>
                    <span className="text-slate-400">¥ {formatCents(a.balanceCents)} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
