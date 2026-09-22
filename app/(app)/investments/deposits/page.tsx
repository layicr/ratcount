import { INV } from "@/lib/constants";
import { makeInvestmentTypePage } from "../investment-type-page";
import type { AppDict } from "@/i18n/dict";

/** 定期存款管理：新增 / 编辑（独立页）/ 删除（软删除） */
export default makeInvestmentTypePage({
  type: INV.deposit,
  variant: "fixed",
  title: (d: AppDict) => d.nav.investDeposits,
  basePath: "/investments/deposits",
  newHref: "/investments/new?type=deposit",
});
