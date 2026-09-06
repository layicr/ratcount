import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { dashboardStats, yearSummary, type StatsPeriod } from "@/lib/queries";
import { Overview } from "../components/reports/overview";
import { CategoryTab } from "../components/reports/category-tab";
import { TrendTab } from "../components/reports/trend-tab";
import { ProjectTab } from "../components/reports/project-tab";
import { TagTab } from "../components/reports/tag-tab";
import { AssetTab } from "../components/reports/asset-tab";

const TABS = [
  { v: "overview", k: "overview" }, { v: "trend", k: "trend" }, { v: "category", k: "category" },
  { v: "project", k: "project" }, { v: "tag", k: "tag" }, { v: "asset", k: "asset" },
];

/** 报表：7 维页签（i18n） */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; catType?: string; year?: string; period?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.v === sp.tab) ? sp.tab! : "overview";

  // 解析时间范围参数：year-2025 / month-2025-09，默认当前月
  const now = new Date();
  let period: StatsPeriod = { type: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
  if (sp.period) {
    const m = sp.period.match(/^(year|month)-(\d{4})(?:-(\d{2}))?$/);
    if (m) {
      const y = parseInt(m[2], 10);
      if (m[1] === "year") period = { type: "year", year: y };
      else period = { type: "month", year: y, month: parseInt(m[3] ?? "01", 10) };
    }
  }

  const [s, yearTrend] = await Promise.all([
    dashboardStats(ledger.id, period),
    yearSummary(ledger.id, period.year),
  ]);

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

      {tab === "overview" && <Overview s={s} period={period} yearTrend={yearTrend} />}
      {tab === "category" && <CategoryTab ledgerId={ledger.id} catType={sp.catType ?? "expense"} period={period} />}
      {tab === "trend" && <TrendTab s={s} />}
      {tab === "project" && <ProjectTab ledgerId={ledger.id} period={period} />}
      {tab === "tag" && <TagTab ledgerId={ledger.id} period={period} />}
      {tab === "asset" && <AssetTab ledgerId={ledger.id} period={period} s={s} />}
    </div>
  );
}
