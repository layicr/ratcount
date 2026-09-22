import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 不动产管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.real_estate,
  variant: "estate",
  title: (d: AppDict) => d.nav.investRealEstate,
  basePath: "/investments/real-estate",
  newHref: "/investments/new?type=real_estate",
});
