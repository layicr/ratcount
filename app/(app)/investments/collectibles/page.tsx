import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 收藏品管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.collectible,
  variant: "tradable",
  title: (d: AppDict) => d.nav.investCollectibles,
  basePath: "/investments/collectibles",
  newHref: "/investments/new?type=collectible",
});
