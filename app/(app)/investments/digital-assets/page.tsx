import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 数字资产管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.digital_asset,
  variant: "tradable",
  title: (d: AppDict) => d.nav.investDigitalAssets,
  basePath: "/investments/digital-assets",
  newHref: "/investments/new?type=digital_asset",
});
