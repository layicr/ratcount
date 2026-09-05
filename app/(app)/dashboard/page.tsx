import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { dashboardStats } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { getLocale, getDictionary } from "@/lib/i18n";
import { TxOps } from "./tx-ops";
import { TxTypeBadge } from "../components/badges";

/** 仪表盘：净资产 / 本月收支 / 资产分布 / 月度趋势 */
export default async function DashboardPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) redirect("/login");
  const s = await dashboardStats(ledger.id);
  const d = getDictionary(await getLocale());

  const maxTrend = Math.max(
    1,
    ...s.trend.map((t) => Math.max(t.income, t.expense)),
  );

  // 账户类型 → i18n key（snake_case → camelCase）
  const typeKey: Record<string, string> = {
    cash: "cash", debit_card: "debitCard", credit_card: "creditCard", wechat: "wechat",
    savings: "savings", investment: "investment", fund: "fund", precious_metal: "preciousMetal",
    bond: "bond", foreign_currency: "foreignCurrency", custom: "custom",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">
          {ledger.icon} {ledger.name} · {d.dashboard.title}
        </h1>
        <Link
          href="/add"
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700"
        >
          {d.dashboard.addFlow}
        </Link>
      </div>

      {/* 统计卡：净资产 / 本月收支 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={d.dashboard.netWorth} value={`¥ ${formatCents(s.netWorth)}`} sub={`${d.dashboard.assets} ¥ ${formatCents(s.assets)} − ${d.dashboard.liabilities} ¥ ${formatCents(s.liabilities)}`} />
        <StatCard label={d.dashboard.monthIncome} value={`+¥ ${formatCents(s.monthIncome)}`} sub={d.common.income} tone="green" />
        <StatCard label={d.dashboard.monthExpense} value={`-¥ ${formatCents(s.monthExpense)}`} sub={d.common.expense} tone="red" />
        <StatCard label={d.dashboard.monthBalance} value={`+¥ ${formatCents(s.monthBalance)}`} sub={`${d.dashboard.balanceRate} ${s.balanceRate}%`} tone={s.monthBalance >= 0 ? "green" : "red"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 月度趋势（近 6 月） */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{d.dashboard.trend6m}</h2>
          <div className="flex h-40 items-end gap-2">
            {s.trend.map((t) => (
              <div key={t.m} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 items-end gap-1">
                  <div
                    className="w-3 rounded-t bg-green-500/80"
                    style={{ height: `${(t.income / maxTrend) * 100}%` }}
                    title={`${d.common.income} ¥${formatCents(t.income)}`}
                  />
                  <div
                    className="w-3 rounded-t bg-red-500/75"
                    style={{ height: `${(t.expense / maxTrend) * 100}%` }}
                    title={`${d.common.expense} ¥${formatCents(t.expense)}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{t.m.slice(5)}{d.common.month}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500/80" />{d.dashboard.legendIncome}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/75" />{d.dashboard.legendExpense}</span>
          </div>
        </div>

        {/* 资产分布 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{d.dashboard.assetDist}</h2>
          {s.distribution.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{d.dashboard.noData}</p>
          ) : (
            <div className="space-y-3">
              {s.distribution.map((dist) => (
                <div key={dist.type}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">{(d.acctType as Record<string, string>)[typeKey[dist.type]] ?? dist.type}</span>
                    <span className="text-slate-400">¥ {formatCents(dist.cents)} · {dist.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(2, dist.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 近期流水 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{d.dashboard.recent}</h2>
          <Link href="/transactions" className="text-xs text-teal-600 hover:underline">{d.dashboard.viewAll}</Link>
        </div>
        {s.recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{d.dashboard.noFlow}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="py-2">{d.tx.type}</th><th>{d.tx.category}</th><th>{d.tx.summary}</th><th className="text-right">{d.tx.amount}</th><th className="text-right">{d.tx.date}</th><th className="text-right">{d.tx.actions}</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-50">
                    <td className="py-2"><TxTypeBadge type={tx.type} /></td>
                    <td className="text-slate-600">{tx.category?.icon} {tx.category?.name ?? "-"}</td>
                    <td className="max-w-[180px] truncate text-slate-600">{tx.remark ?? "-"}</td>
                    <td className={`text-right font-medium ${tx.type === "income" ? "text-green-600" : tx.type === "expense" ? "text-red-600" : "text-slate-500"}`}>
                      {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}¥ {formatCents(tx.amountCents)}
                    </td>
                    <td className="text-right text-slate-400">{tx.txDate}</td>
                    <td className="text-right"><TxOps tx={tx} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
