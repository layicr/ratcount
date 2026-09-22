import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 股票管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.stock,
  variant: "tradable",
  title: (d: AppDict) => d.nav.investStocks,
  basePath: "/investments/stocks",
  newHref: "/investments/new?type=stock",
});
