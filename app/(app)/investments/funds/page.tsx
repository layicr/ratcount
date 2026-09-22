import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 基金管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.fund,
  variant: "tradable",
  title: (d: AppDict) => d.nav.investFunds,
  basePath: "/investments/funds",
  newHref: "/investments/new?type=fund",
});
