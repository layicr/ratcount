"use client";

import { useTranslations } from "next-intl";
import { DonutChart, type DonutRow } from "./donut-chart";
import { TX, type CategoryType } from "@/lib/constants";

type CategoryRow = {
  category?: { name: string; icon: string } | null;
  cents: number;
  pct: number;
};

/** 分类占比环形图（ECharts） */
export function CategoryPieChart({ data, type, title }: { data: CategoryRow[]; type: CategoryType; title?: string }) {
  const t = useTranslations();
  const rows: DonutRow[] = data.map((r) => ({
    name: r.category?.name ?? t("reports.unclassified"),
    cents: r.cents,
  }));

  return (
    <DonutChart
      data={rows}
      title={title ?? (type === TX.expense ? t("reports.expenseCat") : t("reports.incomeCat"))}
      emptyText={t("common.empty")}
    />
  );
}
