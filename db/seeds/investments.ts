/** 投资持仓定义数据（seed 专用）/ Investment holding definitions (seed-only) */
import { type AcctKey } from "./types";

export type HoldingDef = {
  type:
    | "stock"
    | "fund"
    | "deposit"
    | "bond"
    | "metal"
    | "real_estate"
    | "digital_asset"
    | "collectible"
    | "insurance"
    | "loan";
  subType?: string;
  name: string;
  code?: string;
  accountId: AcctKey;
  paymentAccountId: AcctKey;
  /** 数量（单位由 type 决定，×10000 表示股/份，×100 表示克/件等）
   *  定期 / 国债 / 储蓄型保险 / 借贷 / 不动产 不使用数量 → 固定 0（与表单保存口径一致）
   *  Quantity (unit depends on type; ×10000 = shares/units, ×100 = grams/pieces, etc.)
   *  Deposit / bond / savings insurance / loan / real estate don't use quantity → fixed 0 (matches form save behavior) */
  quantity: number;
  costCents: number;
  feeCents: number;
  currentValueCents: number;
  purchaseDate: string;
  /** 到期日（定期 / 国债 / 保险用）/ maturity date (deposit / bond / insurance) */
  maturityDate?: string;
  /** 年利率（字符串格式，如 "3.00%"）/ annual rate (string, e.g. "3.00%") */
  interestRate?: string;
  location?: string;
  areaSqm?: number;
  status: "active" | "sold" | "matured";
  remark: string;
  /** 借贷方向（仅 type=loan）；lend 借出 / borrow 借入，缺省按 lend 处理 / loan direction (type=loan only); lend out / borrow in, defaults to lend */
  direction?: "lend" | "borrow";
};

/** 演示用投资持仓列表（按账户分组）/ Demo holding list (grouped by account) */
export const HOLDING_DEFS: HoldingDef[] = [
  // 股票 · 贵州茅台（A股账户）/ Stock · Kweichow Moutai (A-share account)
  {
    type: "stock", name: "贵州茅台", code: "600519",
    accountId: "stock", paymentAccountId: "cmb",
    quantity: 100 * 10000, // 100 股 / 100 shares
    costCents: 100 * 148000, feeCents: 3000, currentValueCents: 100 * 162000,
    purchaseDate: "2025-03-12", status: "active", remark: "长线价值仓",
  },
  // 股票 · 宁德时代（A股账户）/ Stock · CATL (A-share account)
  {
    type: "stock", name: "宁德时代", code: "300750",
    accountId: "stock", paymentAccountId: "cmb",
    quantity: 300 * 10000, // 300 股 / 300 shares
    costCents: 300 * 21000, feeCents: 2000, currentValueCents: 300 * 23500,
    purchaseDate: "2025-06-01", status: "active", remark: "新能源赛道",
  },
  // 基金 · 易方达蓝筹精选（关联账户：基金账户，对齐「基金 → 基金类型账户」）/ Fund · E Fund Blue Chip (linked to fund account)
  {
    type: "fund", name: "易方达蓝筹精选", code: "005827",
    accountId: "fund", paymentAccountId: "cmb",
    quantity: 8000 * 10000, // 8000 份 / 8000 units
    costCents: 8000 * 250, feeCents: 1000, currentValueCents: 8000 * 278,
    purchaseDate: "2024-11-20", status: "active", remark: "定投份额",
  },
  // 定期 · 招行大额存单（3年）：固收类不使用数量（0，与表单保存口径一致）/ Deposit · CMB large CD (3y): fixed-income uses no quantity (0)
  {
    type: "deposit", name: "招行大额存单(3年)",
    accountId: "savings", paymentAccountId: "cmb",
    quantity: 0, costCents: 20000000, feeCents: 0, currentValueCents: 20000000,
    purchaseDate: "2024-03-01", maturityDate: "2027-03-01", interestRate: "2.60%",
    status: "active", remark: "到期一次性付息",
  },
  // 国债 · 储蓄国债（5年）/ Bond · savings bond (5y)
  {
    type: "bond", name: "储蓄国债(5年)",
    accountId: "bond", paymentAccountId: "cmb",
    quantity: 0, costCents: 10000000, feeCents: 0, currentValueCents: 10000000,
    purchaseDate: "2024-05-10", maturityDate: "2029-05-10", interestRate: "3.00%",
    status: "active", remark: "电子式储蓄国债",
  },
  // 贵金属 · 黄金ETF / Metal · gold ETF
  {
    type: "metal", subType: "gold", name: "黄金ETF",
    accountId: "gold", paymentAccountId: "cmb",
    quantity: 50 * 100, // 50 克 / 50 g
    costCents: 50 * 45000, feeCents: 500, currentValueCents: 50 * 56000,
    purchaseDate: "2025-01-15", status: "active", remark: "避险配置",
  },
  // 贵金属 · 实物白银 / Metal · physical silver
  {
    type: "metal", subType: "silver", name: "实物白银",
    accountId: "gold", paymentAccountId: "cmb",
    quantity: 1000 * 100, // 1000 克 / 1000 g
    costCents: 1000 * 650, feeCents: 200, currentValueCents: 1000 * 720,
    purchaseDate: "2025-02-08", status: "active", remark: "小额配置",
  },
  // 不动产 · 朝阳公寓（关联账户：房产账户，对齐「不动产 → 不动产类型账户」）/ Real estate · Chaoyang apartment (linked to real-estate account)
  {
    type: "real_estate", name: "朝阳公寓",
    accountId: "real_estate", paymentAccountId: "cmb",
    quantity: 0, costCents: 450000000, feeCents: 0, currentValueCents: 520000000,
    purchaseDate: "2022-09-01", location: "北京市朝阳区", areaSqm: 8950, // 89.50㎡
    status: "active", remark: "自持收租",
  },
  // 股票 · 中国平安（2026 年建仓）/ Stock · Ping An (opened 2026)
  {
    type: "stock", name: "中国平安", code: "601318",
    accountId: "stock", paymentAccountId: "cmb",
    quantity: 500 * 10000, // 500 股 / 500 shares
    costCents: 500 * 4680, feeCents: 5000, currentValueCents: 500 * 5230,
    purchaseDate: "2026-07-08", status: "active", remark: "低估值补仓",
  },
  // 基金 · 沪深300ETF（2026 年建仓）/ Fund · CSI 300 ETF (opened 2026)
  {
    type: "fund", name: "沪深300ETF", code: "510300",
    accountId: "fund", paymentAccountId: "cmb",
    quantity: 10000 * 10000, // 10000 份 / 10000 units
    costCents: 10000 * 385, feeCents: 1200, currentValueCents: 10000 * 412,
    purchaseDate: "2026-04-15", status: "active", remark: "宽基定投",
  },
  // 贵金属 · 黄金加仓（2026 年）/ Metal · gold add-on (2026)
  {
    type: "metal", subType: "gold", name: "黄金(加仓)",
    accountId: "gold", paymentAccountId: "cmb",
    quantity: 30 * 100, // 30 克 / 30 g
    costCents: 30 * 48000, feeCents: 300, currentValueCents: 30 * 56000,
    purchaseDate: "2026-06-10", status: "active", remark: "回调加仓",
  },
  // 定期 · 招行大额存单(2年) / Deposit · CMB large CD (2y)
  {
    type: "deposit", name: "招行大额存单(2年)",
    accountId: "savings", paymentAccountId: "cmb",
    quantity: 0, costCents: 10000000, feeCents: 0, currentValueCents: 10000000,
    purchaseDate: "2026-02-20", maturityDate: "2028-02-20", interestRate: "2.15%",
    status: "active", remark: "到期一次性付息",
  },
  // 股票 · 比亚迪（已卖出：演示 sold 状态）/ Stock · BYD (sold: demonstrates the sold status)
  {
    type: "stock", name: "比亚迪", code: "002594",
    accountId: "stock", paymentAccountId: "cmb",
    quantity: 200 * 10000, // 200 股 / 200 shares
    costCents: 200 * 26000, feeCents: 2500, currentValueCents: 200 * 31200,
    purchaseDate: "2024-08-16", status: "sold", remark: "已止盈卖出",
  },
  // 定期 · 招行定期(1年)（已到期：演示 matured 状态）/ Deposit · CMB time deposit (1y, matured: demonstrates the matured status)
  {
    type: "deposit", name: "招行定期(1年)",
    accountId: "savings", paymentAccountId: "cmb",
    quantity: 0, costCents: 5000000, feeCents: 0, currentValueCents: 5130000,
    purchaseDate: "2025-03-01", maturityDate: "2026-03-01", interestRate: "1.95%",
    status: "matured", remark: "已到期 · 本息到账",
  },
  // 数字资产 · 比特币 / Digital asset · Bitcoin
  {
    type: "digital_asset", name: "比特币", code: "BTC",
    accountId: "digital_asset", paymentAccountId: "cmb",
    quantity: 500, // 0.05 BTC
    costCents: 2800000, feeCents: 5000, currentValueCents: 3000000,
    purchaseDate: "2025-09-01", status: "active", remark: "长期持有 · 链上资产",
  },
  // 收藏品 · 齐白石《虾趣图》/ Collectible · Qi Baishi "Shrimp"
  {
    type: "collectible", name: "齐白石《虾趣图》",
    accountId: "collectible", paymentAccountId: "cmb",
    quantity: 1, // 1 件 / 1 piece
    costCents: 1800000, feeCents: 0, currentValueCents: 2000000,
    purchaseDate: "2024-05-01", status: "active", remark: "保值收藏",
  },
  // 储蓄型保险 · 平安盛世金越(终身寿) / Savings insurance · Ping An whole life
  {
    type: "insurance", name: "平安盛世金越(终身寿)",
    accountId: "insurance", paymentAccountId: "cmb",
    quantity: 0, costCents: 5000000, feeCents: 0, currentValueCents: 5200000,
    purchaseDate: "2024-01-01", maturityDate: "2054-01-01", interestRate: "3.00%",
    status: "active", remark: "现金价值递增",
  },
  // 民间借贷 · 借给老王 / Private loan · lent to Lao Wang
  {
    type: "loan", name: "借给老王(经营周转)",
    accountId: "loan", paymentAccountId: "cmb", direction: "lend",
    quantity: 0, costCents: 10000000, feeCents: 0, currentValueCents: 10000000,
    purchaseDate: "2025-03-01", maturityDate: "2026-03-01", interestRate: "6.00%",
    status: "active", remark: "民间借贷 · 待收回",
  },
];

/**
 * 持仓标签演示（持仓级标签，与流水标签相互独立）：
 * 持仓名 → 标签名（标签见 seeds/tags.ts），在列表「标签」列与编辑页回显
 * Holding tag demo (holding-level tags, independent from transaction tags):
 * holding name → tag name (tags in seeds/tags.ts); shown in the list "tags" column and the edit form.
 */
export const HOLDING_TAG_DEFS: { holding: string; tag: string }[] = [
  { holding: "贵州茅台", tag: "投资" },
  { holding: "沪深300ETF", tag: "投资" },
  { holding: "招行大额存单(3年)", tag: "投资" },
  { holding: "朝阳公寓", tag: "房贷" },
  { holding: "平安盛世金越(终身寿)", tag: "保险" },
];
