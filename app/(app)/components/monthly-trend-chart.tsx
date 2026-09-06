"use client";

import type { EChartsOption } from "echarts";
import { useT, useLocale } from "@/components/i18n-provider";
import { EChart } from "./echart";

type MonthData = { m: string; income: number; expense: number };

const MONTHS_ZH = ["01月", "02月", "03月", "04月", "05月", "06月", "07月", "08月", "09月", "10月", "11月", "12月"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 根据 m 字段（"2026-04" 或 "4"）生成月份标签 */
function getMonthLabel(m: string, locale: string): string {
  const monthNum = m.includes("-") ? parseInt(m.slice(5, 7), 10) : parseInt(m, 10);
  const arr = locale === "en" ? MONTHS_EN : MONTHS_ZH;
  return arr[monthNum - 1] ?? m;
}

/** 金额（分）格式化为坐标轴短标签：¥x / ¥x.x万 */
function fmtAxis(cents: number): string {
  if (cents >= 1_000_000) return `¥${(cents / 1_000_000).toFixed(1)}万`;
  return `¥${Math.round(cents / 100).toLocaleString()}`;
}

/** 月度收支趋势折线图（ECharts） */
export function MonthlyTrendChart({ data }: { data: MonthData[] }) {
  const t = useT();
  const locale = useLocale();

  const option: EChartsOption = {
    color: ["#ef4444", "#2dd4bf"],
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => `¥${((v as number) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
      axisLabel: { formatter: (v: number) => fmtAxis(v) },
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
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("reports.monthlyTrend")}</h2>
      <EChart option={option} height={320} />
    </div>
  );
}
