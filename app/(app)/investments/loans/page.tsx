import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 借贷管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.loan,
  variant: "fixed",
  title: (d: AppDict) => d.nav.investLoans,
  basePath: "/investments/loans",
  newHref: "/investments/new?type=loan",
});
