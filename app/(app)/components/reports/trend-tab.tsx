import { dashboardStats } from "@/lib/queries";
import { MonthlyTrendChart } from "../monthly-trend-chart";

export async function TrendTab({ s }: { s: Awaited<ReturnType<typeof dashboardStats>> }) {
  return <MonthlyTrendChart data={s.trend} />;
}
