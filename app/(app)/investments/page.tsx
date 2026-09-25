import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { INV, DEFAULT_CURRENCY } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { investmentOverview, parsePeriod, type StatsPeriod } from "@/lib/queries";
import { getResolvedTimeZone } from "@/lib/settings";
import { localParts } from "@/lib/datetime";
import { formatCurrency, formatPercent } from "@/lib/money";
import { INVESTMENT_TYPES, investmentIcon, investmentTypeKey, quantityToDisplay } from "@/lib/investment-types";
import { holdingProfitCents } from "@/lib/investment-flow";
import { TimeRangePicker } from "../components/time-range-picker";
import { InvestmentPieChart } from "../components/investment-pie-chart";
import { getPeriodLabel } from "../components/reports/utils";
import { getMessages, getLocale } from "next-intl/server";
import { makeDictTranslator, type AppDict } from "@/i18n/dict";

/** 投资类型 i18n key → 文案（如 investment.stocks → 股票） */
function invLabel(d: Record<string, string>, key: string): string {
  return d[key.split(".").pop() ?? ""] ?? key;
}

/** 投资总览：时间选择器按买入/起息日期过滤，统计卡 / 分类卡 / 分布图 / 明细表同源 */
export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireUser();
  const ledger = await requireCurrentLedger();
  const sp = await searchParams;

  // 解析时间范围：year-2026 / month-2026-09，默认按用户时区的当前年（复用 lib/queries 同源解析）
  const tz = await getResolvedTimeZone();
  const period: StatsPeriod = parsePeriod(sp.period, { type: "year", year: localParts(new Date(), tz).year });

  const locale = await getLocale();
  const d = (await getMessages()) as unknown as AppDict;
  const inv = d.investment as unknown as Record<string, string>;
  const ov = await investmentOverview(ledger.id, period, tz);
  const cur = ledger.baseCurrencyCode ?? DEFAULT_CURRENCY;
  // 当前时间范围文案（如「2026年9月」），与报表页同源
  const periodLabel = getPeriodLabel(period, locale, makeDictTranslator(d));

  const cards = [
    { label: inv.totalValue, value: formatCurrency(ov.totalValue, cur, locale), tone: "text-slate-900" },
    { label: inv.totalCost, value: formatCurrency(ov.totalCost + ov.totalFee, cur, locale), tone: "text-slate-900" },
    { label: inv.totalProfit, value: formatCurrency(ov.totalProfit, cur, locale), tone: ov.totalProfit >= 0 ? "text-green-600" : "text-red-600" },
    { label: inv.totalCount, value: String(ov.totalCount), tone: "text-slate-900" },
  ];

  const pieData = INVESTMENT_TYPES
    .map((t) => ({ name: invLabel(inv, t.key), cents: ov.byType[t.v]?.value ?? 0 }))
    .filter((r) => r.cents > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-lg font-bold text-slate-800">{inv.title}</h1>
        {/* 时间选择独立一行：左侧「XXXX年X月 总览」，右侧时间选择器 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-slate-800">{periodLabel} {d.reports.overview}</span>
          <TimeRangePicker period={period} />
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-400">{c.label}</div>
            <div className={`mt-1 text-xl font-bold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 10 类投资分类卡 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INVESTMENT_TYPES.map((t) => {
          const b = ov.byType[t.v];
          const pct = ov.totalValue ? ((b?.value ?? 0) / ov.totalValue) : 0;
          return (
            <Link
              key={t.v}
              href={t.href}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-400 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{investmentIcon(t.v)}</span>
                <span className="text-sm font-semibold text-slate-700">{invLabel(inv, t.key)}</span>
                <span className="ml-auto text-xs text-slate-400">{b?.count ?? 0} {inv.holdings}</span>
              </div>
              <div className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(b?.value ?? 0, cur, locale)}</div>
              <div className="mt-1 text-xs text-slate-400">
                {inv.profit}{" "}
                <span className={b && b.profit >= 0 ? "text-green-600" : "text-red-600"}>
                  {b ? formatCurrency(b.profit, cur, locale) : formatCurrency(0, cur, locale)}
                </span>{" "}
                · {formatPercent(pct, locale)}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 资产分布 + 持仓明细 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <InvestmentPieChart data={pieData} title={inv.assetDistribution} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{inv.holdingsDetail}</h2>
          {ov.holdings.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{d.common.empty}</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="py-2">{inv.name}</th>
                    <th className="text-right">{inv.quantity}</th>
                    <th className="text-right">{inv.marketValue}</th>
                    <th className="text-right">{inv.profit}</th>
                    <th className="text-right">{inv.profitRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.holdings.map((h) => {
                    // 收益 = 浮盈 + 累计派息（派息时市值已除权）；口径收口在 holdingProfitCents
                    const profit = holdingProfitCents({
                      valueCents: h.currentValueCents,
                      costCents: h.costCents,
                      feeCents: h.feeCents,
                      dividendCents: h.dividendCents,
                    });
                    const rate = h.costCents + h.feeCents ? profit / (h.costCents + h.feeCents) : null;
                    return (
                      <tr key={h.id} className="border-b border-slate-50">
                        <td className="py-2 text-slate-700">
                          <span className="mr-1">{investmentIcon(h.type)}</span>
                          {h.name}
                        </td>
                        <td className="text-right text-slate-500">
                          {h.type === INV.real_estate || h.type === INV.deposit || h.type === INV.bond || h.type === INV.insurance || h.type === INV.loan
                            ? "—"
                            : quantityToDisplay(h.type, h.quantity)}
                        </td>
                        <td className="text-right text-slate-700">{formatCurrency(h.currentValueCents, h.currencyCode, locale)}</td>
                        <td className={`text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(profit, h.currencyCode, locale)}
                        </td>
                        <td className={`text-right ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {rate !== null ? formatPercent(rate, locale) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
