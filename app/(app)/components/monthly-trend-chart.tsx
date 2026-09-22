"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useTranslations, useLocale } from "next-intl";
import { useBaseCurrency } from "@/components/currency-context";
import { EChart } from "./echart";
import { getMonthShortNames } from "@/lib/datetime";

type MonthData = { m: string; income: number; expense: number };

/** 根据 m 字段（"2026-04" 或 "4"）生成月份标签，随 locale 自动变化 */
function getMonthLabel(m: string, locale: string): string {
  const monthNum = m.includes("-") ? parseInt(m.slice(5, 7), 10) : parseInt(m, 10);
  return getMonthShortNames(locale as Parameters<typeof getMonthShortNames>[0])[monthNum - 1] ?? m;
}

/** 金额（分）格式化为坐标轴短标签：随 locale/币种自动（compact 形式，如 ¥1.2万 / $1.2K） */
function fmtAxis(cents: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** tooltip 金额（分）格式化：随 locale/币种自动 */
function fmtTooltip(cents: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** 月度收支趋势折线图（ECharts） */
export function MonthlyTrendChart({ data }: { data: MonthData[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const currency = useBaseCurrency();

  // useMemo：option 内联构造会导致引用每次渲染都变化 →
  // EChart 的 useEffect([option]) 每次都 setOption 重排整图（父组件任意 state 变化都会触发）
  const option: EChartsOption = useMemo(() => ({
    color: ["#ef4444", "#2dd4bf"],
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => fmtTooltip(v as number, locale, currency),
    },
    legend: { data: [t("common.income"), t("common.expense")], bottom: 0 },
    grid: { left: 8, right: 16, top: 24, bottom: 36, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: data.map((d) => getMonthLabel(d.m, locale)),
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => fmtAxis(v, locale, currency) },
    },
    series: [
      {
        name: t("common.income"),
        type: "line",
        smooth: true,
        showSymbol: true,
        data: data.map((d) => d.income),
        itemStyle: { color: "#ef4444" },
        areaStyle: { color: "rgba(239,68,68,0.08)" },
      },
      {
        name: t("common.expense"),
        type: "line",
        smooth: true,
        showSymbol: true,
        data: data.map((d) => d.expense),
        itemStyle: { color: "#2dd4bf" },
        areaStyle: { color: "rgba(45,212,191,0.08)" },
      },
    ],
  }), [data, locale, currency, t]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("reports.monthlyTrend")}</h2>
      <EChart option={option} height={320} />
    </div>
  );
}
