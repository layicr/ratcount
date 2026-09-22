"use client";

import { useTranslations } from "next-intl";
import { DonutChart } from "./donut-chart";

export type InvestPieRow = { name: string; cents: number };

/** 投资资产分布环形图（ECharts，客户端动态导入 SSR 安全） */
export function InvestmentPieChart({ data, title }: { data: InvestPieRow[]; title: string }) {
  const t = useTranslations();
  return <DonutChart data={data} title={title} emptyText={t("common.empty")} />;
}
