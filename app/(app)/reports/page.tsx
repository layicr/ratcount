import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import {
  dashboardStats, categoryBreakdown, projectSummary, tagSummary, yearSummary,
} from "@/lib/queries";
import { formatCents } from "@/lib/money";

const TABS = [
  { v: "overview", k: "overview" }, { v: "category", k: "category" }, { v: "trend", k: "trend" },
  { v: "project", k: "project" }, { v: "tag", k: "tag" }, { v: "asset", k: "asset" }, { v: "year", k: "year" },
];

/** 服务端模板插值：把 {key} 替换为变量 */
function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** 账户类型 → i18n key（snake_case → camelCase） */
const typeKey: Record<string, string> = {
  cash: "cash", debit_card: "debitCard", credit_card: "creditCard", wechat: "wechat",
  savings: "savings", investment: "investment", fund: "fund", precious_metal: "preciousMetal",
  bond: "bond", foreign_currency: "foreignCurrency", custom: "custom",
};

/** 报表：7 维页签（i18n） */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; catType?: string; year?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.v === sp.tab) ? sp.tab! : "overview";

  const s = await dashboardStats(ledger.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.reports.title}</h1>

      {/* 页签 */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 border border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`/reports?tab=${t.v}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.v ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {d.reports[t.k as keyof typeof d.reports] as unknown as string}
          </Link>
        ))}
      </div>

      {tab === "overview" && <Overview s={s} />}
      {tab === "category" && <CategoryTab ledgerId={ledger.id} catType={sp.catType ?? "expense"} />}
      {tab === "trend" && <TrendTab s={s} />}
      {tab === "project" && <ProjectTab ledgerId={ledger.id} />}
      {tab === "tag" && <TagTab ledgerId={ledger.id} />}
      {tab === "asset" && <AssetTab s={s} />}
      {tab === "year" && <YearTab ledgerId={ledger.id} year={sp.year ?? String(new Date().getFullYear())} />}
    </div>
  );
}

function Card({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

async function Overview({ s }: { s: Awaited<ReturnType<typeof dashboardStats>> }) {
  const d = getDictionary(await getLocale());
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={d.dashboard.netWorth} value={`¥ ${formatCents(s.netWorth)}`} />
        <Card label={d.dashboard.monthIncome} value={`+¥ ${formatCents(s.monthIncome)}`} tone="text-green-600" />
        <Card label={d.dashboard.monthExpense} value={`-¥ ${formatCents(s.monthExpense)}`} tone="text-red-600" />
        <Card label={`${d.reports.balance} / ${d.dashboard.balanceRate}`} value={`¥ ${formatCents(s.monthBalance)}`} sub={`${s.balanceRate}%`} />
      </div>
    </div>
  );
}

async function CategoryTab({ ledgerId, catType }: { ledgerId: string; catType: string }) {
  const d = getDictionary(await getLocale());
  const type = catType === "income" ? "income" : "expense";
  const rows = await categoryBreakdown(ledgerId, type);
  const total = rows.reduce((sum, r) => sum + r.cents, 0);
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-white border border-slate-200 p-1 w-fit">
        {[["expense", d.common.expense], ["income", d.common.income]].map(([v, l]) => (
          <Link key={v} href={`/reports?tab=category&catType=${v}`} className={`rounded-lg px-3 py-1.5 text-sm ${type === v ? "bg-teal-600 text-white" : "text-slate-500"}`}>{l}</Link>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {type === "expense" ? d.reports.expenseCat : d.reports.incomeCat}（{d.common.total} ¥{formatCents(total)}）
        </h2>
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{d.reports.noData}</p> : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.category?.id}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">{r.category?.icon} {r.category?.name ?? d.reports.unclassified}</span>
                  <span className="text-slate-400">¥ {formatCents(r.cents)} · {r.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${type === "expense" ? "bg-red-400" : "bg-green-500"}`} style={{ width: `${Math.max(2, r.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function TrendTab({ s }: { s: Awaited<ReturnType<typeof dashboardStats>> }) {
  const d = getDictionary(await getLocale());
  const max = Math.max(1, ...s.trend.map((t) => Math.max(t.income, t.expense)));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{d.reports.trend6m}</h2>
      <div className="flex h-48 items-end gap-2">
        {s.trend.map((t) => (
          <div key={t.m} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-40 items-end gap-1">
              <div className="w-3.5 rounded-t bg-green-500/80" style={{ height: `${(t.income / max) * 100}%` }} title={`${d.common.income} ¥${formatCents(t.income)}`} />
              <div className="w-3.5 rounded-t bg-red-500/75" style={{ height: `${(t.expense / max) * 100}%` }} title={`${d.common.expense} ¥${formatCents(t.expense)}`} />
            </div>
            <span className="text-[10px] text-slate-400">{t.m.slice(5)}{d.common.month}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500/80" />{d.common.income}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/75" />{d.common.expense}</span>
      </div>
    </div>
  );
}

async function ProjectTab({ ledgerId }: { ledgerId: string }) {
  const d = getDictionary(await getLocale());
  const rows = await projectSummary(ledgerId);
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-4 py-2">{d.reports.projectName}</th><th>{d.reports.status}</th><th className="text-right">{d.reports.income}</th>
            <th className="text-right">{d.reports.expense}</th><th className="text-right">{d.reports.balance}</th><th className="text-right">{d.reports.budget}</th><th className="text-right">{d.reports.progress}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{d.reports.noData}</td></tr>}
          {rows.map((r) => {
            const pct = r.budgetCents ? Math.round((r.expense / r.budgetCents) * 100) : 0;
            return (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium">{r.icon} {r.name}</td>
                <td>{r.status === "active" ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{d.projects.active}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{d.projects.completed}</span>}</td>
                <td className="text-right text-green-600">+¥ {formatCents(r.income)}</td>
                <td className="text-right text-red-600">-¥ {formatCents(r.expense)}</td>
                <td className={`text-right font-semibold ${r.balance >= 0 ? "text-slate-800" : "text-red-600"}`}>¥ {formatCents(r.balance)}</td>
                <td className="text-right text-slate-400">¥ {formatCents(r.budgetCents)}</td>
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
  );
}

async function TagTab({ ledgerId }: { ledgerId: string }) {
  const d = getDictionary(await getLocale());
  const rows = await tagSummary(ledgerId);
  return (
    <div className="flex flex-wrap gap-2">
      {rows.length === 0 && <p className="text-sm text-slate-400">{d.tags.empty}</p>}
      {rows.map((t) => (
        <div key={t.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <span className="rounded-full px-2 py-0.5 text-sm font-medium text-white" style={{ background: t.color }}>{t.name}</span>
          <div className="mt-2 text-sm font-semibold text-slate-800">¥ {formatCents(t.amountCents)}</div>
          <div className="text-[11px] text-slate-400">{fmt(d.reports.tagCount, { count: t.count })}</div>
        </div>
      ))}
    </div>
  );
}

async function AssetTab({ s }: { s: Awaited<ReturnType<typeof dashboardStats>> }) {
  const d = getDictionary(await getLocale());
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{fmt(d.reports.assetDist, { total: formatCents(s.assets) })}</h2>
      {s.distribution.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{d.reports.noData}</p> : (
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
  );
}

async function YearTab({ ledgerId, year }: { ledgerId: string; year: string }) {
  const d = getDictionary(await getLocale());
  const months = await yearSummary(ledgerId, parseInt(year, 10) || new Date().getFullYear());
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  const years = [new Date().getFullYear() - 1, new Date().getFullYear()];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-white border border-slate-200 p-1 w-fit">
        {years.map((y) => (
          <Link key={y} href={`/reports?tab=year&year=${y}`} className={`rounded-lg px-3 py-1.5 text-sm ${String(y) === year ? "bg-teal-600 text-white" : "text-slate-500"}`}>{y}</Link>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{fmt(d.reports.yearTrend, { year })}</h2>
        <div className="flex h-48 items-end gap-1">
          {months.map((m) => (
            <div key={m.m} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-40 w-full items-end justify-center gap-0.5">
                <div className="w-2 rounded-t bg-green-500/80" style={{ height: `${(m.income / max) * 100}%` }} title={`${d.common.income} ¥${formatCents(m.income)}`} />
                <div className="w-2 rounded-t bg-red-500/75" style={{ height: `${(m.expense / max) * 100}%` }} title={`${d.common.expense} ¥${formatCents(m.expense)}`} />
              </div>
              <span className="text-[9px] text-slate-400">{m.m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
