import { dashboardStats } from "@/lib/queries";
import { MonthlyTrendChart } from "../monthly-trend-chart";

// 趋势页签（月度收支折线）/ Trend tab (monthly line chart)
export async function TrendTab({ s }: { s: Awaited<ReturnType<typeof dashboardStats>> }) {
  return <MonthlyTrendChart data={s.trend} />;
}
