import { investmentTypes, metalSubTypes, INV, type InvestmentType, type MetalSubType, type AccountType } from "@/lib/constants"
import { accountTypeIcon, accountTypeCamelKey } from "@/lib/constants";


/**
 * 投资模块单一数据源（UI 侧）
 *  - INVESTMENT_TYPES：10 类投资的 值 / i18n key / 图标 / 管理页路径
 *  - METAL_SUB_TYPES：贵金属细分（黄金 / 白银）
 *  - 资产分布伪类型：invest_ 前缀，避免与账户类型（fund/bond/real_estate…）同名冲突
 *  - PROTECTION_HOLDING_TYPES：归属「保障」导航组的持仓类型（其余归投资组）
 * Investment module single source (UI side)
 *  - INVESTMENT_TYPES: 10 investment types with value / i18n key / icon / manage-page path
 *  - METAL_SUB_TYPES: precious-metal sub-types (gold / silver)
 *  - Asset-distribution pseudo-types: invest_ prefix, to avoid name clashes with account types (fund/bond/real_estate…)
 *  - PROTECTION_HOLDING_TYPES: holding types under the "Protection" nav group (the rest are under Investments)
 */

export const INVESTMENT_TYPES: { v: InvestmentType; key: string; icon: string; href: string }[] = [
  { v: INV.stock, key: "investment.stocks", icon: "📈", href: "/investments/stocks" },
  { v: INV.digital_asset, key: "investment.digitalAssets", icon: "₿", href: "/investments/digital-assets" },
  { v: INV.fund, key: "investment.funds", icon: "📉", href: "/investments/funds" },
  { v: INV.collectible, key: "investment.collectibles", icon: "🖼️", href: "/investments/collectibles" },
  { v: INV.deposit, key: "investment.deposits", icon: "🏦", href: "/investments/deposits" },
  { v: INV.bond, key: "investment.bonds", icon: "📜", href: "/investments/bonds" },
  { v: INV.metal, key: "investment.metals", icon: "🥇", href: "/investments/metals" },
  { v: INV.real_estate, key: "investment.realEstate", icon: "🏠", href: "/investments/real-estate" },
  { v: INV.loan, key: "investment.loans", icon: "🤝", href: "/investments/loans" },
  { v: INV.insurance, key: "investment.insurance", icon: "☂️", href: "/investments/insurance" },
];

/** 归属「保障」导航组的持仓类型（导航分组用，顺序同 INVESTMENT_TYPES）/ Holding types under the "Protection" nav group (for nav grouping; order matches INVESTMENT_TYPES) */
export const PROTECTION_HOLDING_TYPES: InvestmentType[] = [INV.insurance];

/** 投资类型 → 管理页路径；贵金属可带 subType 页签（用于新增/编辑后返回）/ Investment type → manage-page path; metals may carry a subType tab (for return-after-create/edit) */
export function investmentListHref(type: InvestmentType, subType?: string | null): string {
  const base = INVESTMENT_TYPES.find((t) => t.v === type)?.href ?? "/investments";
  return type === INV.metal && subType ? `${base}?sub=${subType}` : base;
}

/** 贵金属细分：黄金 / 白银 / Precious-metal sub-types: gold / silver */
export const METAL_SUB_TYPES: { v: MetalSubType; key: string; icon: string }[] = [
  { v: "gold", key: "investment.gold", icon: "🥇" },
  { v: "silver", key: "investment.silver", icon: "🥈" },
];

/** 资产分布中投资条目的伪类型前缀 / Pseudo-type prefix for investment entries in the asset distribution */
export const INVEST_DIST_PREFIX = "invest_";

/** 投资类型 → 资产分布伪类型键（如 stock → invest_stock）/ Investment type → asset-distribution pseudo-key (e.g. stock → invest_stock) */
export const investDistKey = (type: string) => `${INVEST_DIST_PREFIX}${type}`;

/** 是否为投资伪类型（用于资产分布渲染分支）/ Whether this is an investment pseudo-type (asset-distribution render branch) */
export function isInvestDistType(type: string): boolean {
  return type.startsWith(INVEST_DIST_PREFIX);
}

/** 资产分布伪类型 → 投资类型（如 invest_stock → stock）/ Asset-distribution pseudo-type → investment type (e.g. invest_stock → stock) */
export function investDistTypeOf(type: string): string {
  return type.slice(INVEST_DIST_PREFIX.length);
}

/** 投资类型 → 图标，未知回退 📦 / Investment type → icon; falls back to 📦 */
export function investmentIcon(type: string): string {
  return INVESTMENT_TYPES.find((t) => t.v === type)?.icon ?? "📦";
}

/** 投资类型 → i18n key，未知回退原值 / Investment type → i18n key; falls back to the raw value */
export function investmentTypeKey(type: string): string {
  return INVESTMENT_TYPES.find((t) => t.v === type)?.key ?? type;
}

/** 贵金属细分 → i18n key，未知回退原值 / Precious-metal sub-type → i18n key; falls back to the raw value */
export function metalSubTypeKey(sub: string): string {
  return METAL_SUB_TYPES.find((s) => s.v === sub)?.key ?? sub;
}

/**
 * 数量整数存储倍率：股票股数×1 / 基金份额×10000 / 贵金属克数×100 / 数字资产×10000
 * 定期、国债、储蓄型保险、借贷、不动产不使用 quantity（不动产用 areaSqm，其余按 1 件/份）
 * Quantity storage multiplier (integers): stock ×1 / fund ×10000 / metal ×100 / digital asset ×10000.
 * Deposits, bonds, savings insurance, loans, and real estate don't use quantity (real estate uses areaSqm; others are 1 unit/share).
 */
export const QTY_SCALE: Record<InvestmentType, number> = {
  [INV.stock]: 1, [INV.fund]: 10000, [INV.deposit]: 1, [INV.bond]: 1, [INV.metal]: 100, [INV.real_estate]: 1,
  [INV.digital_asset]: 10000, [INV.collectible]: 1, [INV.insurance]: 1, [INV.loan]: 1,
};

/** 类股票：有代码、数量、交易费用，列头显示"实际成本/浮动收益"两行详细说明 / Stock-like: has code, quantity, fees; headers show two lines "actual cost / floating P&L" */
export function isStockLike(type: InvestmentType): boolean {
  return type === INV.stock || type === INV.digital_asset;
}

/** 可交易类：股票 / 数字资产 / 基金 / 收藏品（展示代码与数量，支持卖出 + 派息）/ Tradable: stock / digital asset / fund / collectible (show code & quantity; support sell + dividend) */
export function isTradable(type: InvestmentType): boolean {
  return type === INV.stock || type === INV.fund || type === INV.digital_asset || type === INV.collectible;
}

/** 固收/到期类：定期 / 国债 / 储蓄型保险 / 民间借贷（到期兑付而非卖出）/ Fixed-income/maturity: deposit / bond / savings insurance / loan (redeem at maturity, not sell) */
export function isFixedIncome(type: InvestmentType): boolean {
  return type === INV.deposit || type === INV.bond || type === INV.insurance || type === INV.loan;
}

/** 持仓类型 → 关联账户应限定的账户类型；null 表示不限定（展示全部账户）/ Holding type → the account type its linked account must be; null = unrestricted (show all accounts) */
export function linkedAccountTypeOf(type: InvestmentType): AccountType | null {
  if (type === INV.stock) return "investment";
  if (type === INV.fund) return "fund";
  if (type === INV.deposit) return "savings"; // 定期账户（acctType.savings = 定期）/ time-deposit account
  if (type === INV.bond) return "bond"; // 国债账户（acctType.bond = 国债）/ treasury-bond account
  if (type === INV.metal) return "precious_metal"; // 贵金属账户（acctType.preciousMetal = 贵金属）/ precious-metal account
  if (type === INV.real_estate) return "real_estate"; // 不动产账户（acctType.realEstate = 不动产）/ real-estate account
  if (type === INV.digital_asset) return "digital_asset";
  if (type === INV.collectible) return "collectible";
  if (type === INV.insurance) return "insurance";
  if (type === INV.loan) return "loan";
  return null;
}

/** 库存数量 → 展示值（份额 / 克数等）/ Stored quantity → display value (shares / grams / …) */
export function quantityToDisplay(type: string, qty: number): number {
  return qty / (QTY_SCALE[type as InvestmentType] ?? 1);
}

/** 展示值 → 库存数量（份额×10000 / 克×100）/ Display value → stored quantity (shares×10000 / grams×100) */
export function displayToQuantity(type: string, v: number): number {
  return Math.round(v * (QTY_SCALE[type as InvestmentType] ?? 1));
}

/** 面积：库存×100 → 展示 ㎡ / Area: stored ×100 → display ㎡ */
export function areaToDisplay(areaSqm: number | null): number {
  return (areaSqm ?? 0) / 100;
}

/** 面积：展示 ㎡ → 库存×100 / Area: display ㎡ → stored ×100 */
export function displayToArea(v: number): number {
  return Math.round(v * 100);
}

/** 资产分布条目 → 图标（自动区分账户类型 / invest_ 投资伪类型）/ Asset-distribution entry → icon (auto-distinguishes account type / invest_ pseudo-type) */
export function distTypeIcon(type: string): string {
  return isInvestDistType(type) ? investmentIcon(investDistTypeOf(type)) : accountTypeIcon(type);
}

/** 资产分布条目 → 展示文案（自动区分 acctType / investment 文案域；t 为全路径 translator，缺键回退原值）/ Asset-distribution entry → label (auto distinguishes acctType / investment domains; t is a full-path translator, key-missing → raw value) */
export function distTypeLabel(t: (key: string) => string, type: string): string {
  if (isInvestDistType(type)) {
    const raw = investDistTypeOf(type);
    const key = investmentTypeKey(raw).split(".").pop() ?? "";
    const label = t(`investment.${key}`);
    return label === `investment.${key}` ? raw : label;
  }
  const key = accountTypeCamelKey(type);
  const label = t(`acctType.${key}`);
  return label === `acctType.${key}` ? type : label;
}

/** 白名单校验（配合 Zod 使用）/ Whitelist check (used with Zod) */
export function isValidInvestmentType(v: string): v is InvestmentType {
  return (investmentTypes as readonly string[]).includes(v);
}

export function isValidMetalSubType(v: string): v is MetalSubType {
  return (metalSubTypes as readonly string[]).includes(v);
}
