import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 储蓄型保险管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.insurance,
  variant: "fixed",
  title: (d: AppDict) => d.nav.investInsurance,
  basePath: "/investments/insurance",
  newHref: "/investments/new?type=insurance",
});
