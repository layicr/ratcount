import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 债券管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.bond,
  variant: "fixed",
  title: (d: AppDict) => d.nav.investBonds,
  basePath: "/investments/bonds",
  newHref: "/investments/new?type=bond",
});
