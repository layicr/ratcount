"use client";

import type { EChartsOption } from "echarts";
import { useT } from "@/components/i18n-provider";
import { EChart } from "./echart";

type CategoryRow = {
  category?: { name: string; icon: string } | null;
  cents: number;
  pct: number;
};

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#f43f5e",
  "#84cc16", "#06b6d4",
];

const fmt = (cents: number) => (cents / 100).toFixed(2);

/** 分类占比环形图（ECharts） */
export function CategoryPieChart({ data, type, title }: { data: CategoryRow[]; type: "income" | "expense"; title?: string }) {
  const t = useT();
  const total = data.reduce((s, r) => s + r.cents, 0);

  const option: EChartsOption = {
    color: COLORS,
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const p = params as { name: string; value: number; percent: number };
        return `${p.name}<br/>¥${fmt(p.value)} · ${p.percent}%`;
      },
    },
    legend: { type: "scroll", orient: "vertical", right: 0, top: "middle", textStyle: { color: "#475569" } },
    title: {
      text: `¥${fmt(total)}`,
      subtext: t("common.total"),
      left: "34%",
      top: "center",
      textAlign: "center",
      textStyle: { fontSize: 16, fontWeight: 700, color: "#1e293b" },
      subtextStyle: { fontSize: 11, color: "#94a3b8" },
    },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        data: data.map((r, i) => ({
          name: r.category?.name ?? t("reports.unclassified"),
          value: r.cents,
          itemStyle: { color: COLORS[i % COLORS.length] },
        })),
      },
    ],
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        {title ?? (type === "expense" ? t("reports.expenseCat") : t("reports.incomeCat"))}
      </h2>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">{t("reports.noData")}</p>
      ) : (
        <EChart option={option} height={280} />
      )}
    </div>
  );
}
