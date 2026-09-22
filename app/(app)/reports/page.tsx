import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { dashboardStats, yearSummary, parsePeriod, type StatsPeriod } from "@/lib/queries";
import { getResolvedTimeZone } from "@/lib/settings";
import { localParts } from "@/lib/datetime";
import { Overview } from "../components/reports/overview";
import { CategoryTab } from "../components/reports/category-tab";
import { TrendTab } from "../components/reports/trend-tab";
import { ProjectTab } from "../components/reports/project-tab";
import { TagTab } from "../components/reports/tag-tab";
import { AssetTab } from "../components/reports/asset-tab";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

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
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.v === sp.tab) ? sp.tab! : "overview";
  const cur = ledger.baseCurrencyCode ?? DEFAULT_CURRENCY;

  // 解析时间范围参数：year-2025 / month-2025-09，默认按用户时区的当前月（复用 lib/queries 同源解析）
  const tz = await getResolvedTimeZone();
  const { year, month } = localParts(new Date(), tz);
  const period: StatsPeriod = parsePeriod(sp.period, { type: "month", year, month });

  const [s, yearTrend] = await Promise.all([
    dashboardStats(ledger.id, period, { includeRecent: false }, tz), // 报表页不展示近期流水，跳过该查询
    yearSummary(ledger.id, period.year, tz),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.reports.title}</h1>

      {/* 页签 */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 border border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`/reports?tab=${t.v}`}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === t.v ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {d.reports[t.k as keyof typeof d.reports] as unknown as string}
          </Link>
        ))}
      </div>

      {tab === "overview" && <Overview s={s} period={period} yearTrend={yearTrend} currency={cur} />}
      {tab === "category" && <CategoryTab ledgerId={ledger.id} catType={sp.catType ?? "expense"} period={period} currency={cur} />}
      {tab === "trend" && <TrendTab s={s} />}
      {tab === "project" && <ProjectTab ledgerId={ledger.id} period={period} currency={cur} />}
      {tab === "tag" && <TagTab ledgerId={ledger.id} period={period} currency={cur} />}
      {tab === "asset" && <AssetTab ledgerId={ledger.id} period={period} s={s} currency={cur} />}
    </div>
  );
}
