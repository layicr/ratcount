import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { listBalances } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { BalanceForm } from "./balance-form";

/** 余额表：期初 + 实时余额 vs 最新快照（对账差异） */
export default async function BalancePage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
  const rows = await listBalances(ledger.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.balance.title}</h1>
      <p className="text-xs text-slate-500">{d.balance.desc}</p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:col-span-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2">{d.balance.account}</th><th>{d.common.type}</th><th>{d.balance.opening}</th>
                <th className="text-right">{d.balance.realtime}</th><th className="text-right">{d.balance.snapshot}</th><th className="text-right">{d.balance.diff}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.icon} {r.name}</td>
                  <td className="text-xs text-slate-400">{r.currencyCode}{r.isAsset ? "" : ` · ${d.accounts.notAsset}`}</td>
                  <td className="text-slate-500">¥ {formatCents(r.openingBalanceCents)}</td>
                  <td className={`text-right font-semibold ${r.balanceCents < 0 ? "text-red-600" : "text-slate-800"}`}>
                    ¥ {formatCents(r.balanceCents)}
                  </td>
                  <td className="text-right text-slate-500">
                    {r.snapshot ? `¥ ${formatCents(r.snapshot.balanceAmountCents)} (${r.snapshot.snapshotDate})` : "-"}
                  </td>
                  <td className={`text-right ${r.diff === null ? "text-slate-300" : r.diff === 0 ? "text-green-600" : "text-amber-600"}`}>
                    {r.diff === null ? "-" : r.diff === 0 ? `✓ ${d.balance.ok}` : `¥ ${formatCents(r.diff)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <BalanceForm
          accounts={rows.map((a) => ({ id: a.id, name: a.name, icon: a.icon, balanceCents: a.balanceCents }))}
        />
      </div>
    </div>
  );
}
