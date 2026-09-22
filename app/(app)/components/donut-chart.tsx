"use client";

import type { EChartsOption } from "echarts";
import { useTranslations, useLocale } from "next-intl";
import { useBaseCurrency } from "@/components/currency-context";
import { EChart } from "./echart";
import { COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/money";

export type DonutRow = { name: string; cents: number };

/**
 * ECharts tooltip 以 HTML 渲染 formatter 返回值，而 name 是用户录入的分类名/账户名。
 * 共享账本下恶意成员可在名称里注入脚本，故此处必须转义，防止存储型 XSS。
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/**
 * 环形图通用封装（分类占比 / 投资资产分布共用）
 *  - 中心标题 = 总额（本地化货币），副标题 = 合计
 *  - 空数据走 emptyText 占位，避免渲染空图
 *  - 调色板可注入，默认 COLORS 循环取色
 */
export function DonutChart({
  data,
  title,
  emptyText,
  palette = COLORS,
  height = 280,
}: {
  data: DonutRow[];
  title: string;
  emptyText: string;
  palette?: readonly string[];
  height?: number;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const currency = useBaseCurrency();
  const money = (cents: number) => formatCurrency(cents, currency, locale);
  const total = data.reduce((s, r) => s + r.cents, 0);

  const option: EChartsOption = {
    color: [...palette],
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const p = params as { name: string; value: number; percent: number };
        return escapeHtml(p.name) + "<br/>" + money(p.value) + " · " + p.percent + "%";
      },
    },
    legend: { type: "scroll", orient: "vertical", right: 0, top: "middle", textStyle: { color: "#475569" } },
    title: {
      text: money(total),
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
          name: r.name,
          value: r.cents,
          itemStyle: { color: palette[i % palette.length] },
        })),
      },
    ],
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">{emptyText}</p>
      ) : (
        <EChart option={option} height={height} />
      )}
    </div>
  );
}
