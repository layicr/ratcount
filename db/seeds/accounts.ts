/** 账户定义数据（seed 专用，非 DB schema）/ Account definitions (seed-only, not DB schema) */
import { type AccountType, ACCT } from "../../lib/constants";
import { type AcctKey } from "./types";
import { computeHistDelta } from "./transactions";

/** 各账户的演示期初余额（分）与历史流水净额相抵后写入 opening_balance / Demo opening balance (cents) per account; opening_balance = this minus historical net delta */
const BASE_OPENING: Record<AcctKey, number> = {
  cash:          20000,     // ¥200.00 现金 / ¥200.00 cash
  cmb:           9580600,   // ¥95,806.00 招行储蓄卡 / ¥95,806.00 CMB debit card
  credit:        -486000,   // −¥4,860.00 信用卡欠款 / −¥4,860.00 credit card debt
  wechat:        645200,    // ¥6,452.00 微信零钱 / ¥6,452.00 WeChat balance
  stock:         15200000,  // ¥152,000.00 A股账户 / ¥152,000.00 A-share account
  usd:           120000,    // ¥1,200.00 美元账户（按汇率折算）/ ¥1,200.00 USD account (converted)
  bond:          8000000,   // ¥80,000.00 国债 / ¥80,000.00 treasury bonds
  gold:          2644000,   // ¥26,440.00 黄金定投 / ¥26,440.00 gold (SIP)
  insurance:     5000000,   // ¥50,000.00 储蓄型保险（无历史流水）/ ¥50,000.00 savings insurance (no history)
  national_pension: 6000000, // ¥60,000.00 国家养老金（无历史流水）/ ¥60,000.00 national pension (no history)
  personal_pension: 2500000, // ¥25,000.00 个人养老金（无历史流水）/ ¥25,000.00 personal pension (no history)
  housing_fund:  8000000,   // ¥80,000.00 公积金（无历史流水）/ ¥80,000.00 housing fund (no history)
  loan:          10000000,  // ¥100,000.00 民间借贷（无历史流水）/ ¥100,000.00 private loan (no history)
  digital_asset: 3000000,  // ¥30,000.00 数字资产（无历史流水）/ ¥30,000.00 digital assets (no history)
  collectible:   2000000,   // ¥20,000.00 收藏品（无历史流水）/ ¥20,000.00 collectibles (no history)
  // 以下三个账户仅作「关联账户」演示（无历史流水、期初为 0）：
  // 用于对齐「持仓类型 → 关联账户类型」限定（基金→基金 / 定期→定期 / 不动产→不动产）
  // The three accounts below are demo "linked accounts" only (no history, opening 0):
  // used to align "holding type → linked account type" (fund→fund / deposit→deposit / real_estate→real_estate)
  fund:          0,
  savings:       0,
  real_estate:   0,
};

export type AcctDef = {
  key: AcctKey;
  name: string;
  type: AccountType;
  icon: string;
  currencyCode?: string;
  openingBalanceCents: number;
  isAsset: boolean;
};

/**
 * 账户定义列表。
 * openingBalanceCents = BASE_OPENING[key] − histDelta[key]，保证「当前余额 = 期初 + 历史流水」等于原型演示值。
 * Account definition list.
 * openingBalanceCents = BASE_OPENING[key] − histDelta[key], so "live balance = opening + history" equals the prototype value.
 */
export const acctDefs: AcctDef[] = (() => {
  const histDelta = computeHistDelta();
  return [
    { key: "cash",         name: "现金",           type: ACCT.cash,         icon: "💵", openingBalanceCents: BASE_OPENING.cash          - (histDelta.get("cash") ?? 0),            isAsset: true  },
    { key: "cmb",          name: "招行储蓄卡",      type: ACCT.debit_card,   icon: "🏦", openingBalanceCents: BASE_OPENING.cmb          - (histDelta.get("cmb") ?? 0),             isAsset: true  },
    { key: "credit",       name: "招行信用卡",      type: ACCT.credit_card,  icon: "💳", openingBalanceCents: BASE_OPENING.credit      - (histDelta.get("credit") ?? 0),          isAsset: false },
    { key: "wechat",       name: "微信",            type: ACCT.wechat,       icon: "💬", openingBalanceCents: BASE_OPENING.wechat      - (histDelta.get("wechat") ?? 0),          isAsset: true  },
    { key: "stock",        name: "A股账户",         type: ACCT.investment,   icon: "📈", openingBalanceCents: BASE_OPENING.stock      - (histDelta.get("stock") ?? 0),           isAsset: true  },
    { key: "usd",          name: "美元账户",        type: ACCT.foreign_currency, icon: "🌐", currencyCode: "USD", openingBalanceCents: BASE_OPENING.usd       - (histDelta.get("usd") ?? 0),            isAsset: true  },
    { key: "bond",         name: "国债",            type: ACCT.bond,         icon: "🛡️", openingBalanceCents: BASE_OPENING.bond        - (histDelta.get("bond") ?? 0),            isAsset: true  },
    { key: "gold",         name: "黄金定投",        type: ACCT.precious_metal, icon: "💎", openingBalanceCents: BASE_OPENING.gold       - (histDelta.get("gold") ?? 0),            isAsset: true  },
    // ===== 新增：保障类 + 资产类账户（无历史流水，opening = base）/ Added: protection + asset accounts (no history, opening = base) =====
    { key: "insurance",       name: "储蓄型保险账户",  type: ACCT.insurance,    icon: "☂️", openingBalanceCents: BASE_OPENING.insurance,       isAsset: true  },
    { key: "national_pension", name: "国家养老金账户", type: ACCT.national_pension, icon: "💰", openingBalanceCents: BASE_OPENING.national_pension, isAsset: true },
    { key: "personal_pension", name: "个人养老金账户", type: ACCT.personal_pension, icon: "💼", openingBalanceCents: BASE_OPENING.personal_pension, isAsset: true },
    { key: "housing_fund",    name: "公积金账户",       type: ACCT.housing_fund, icon: "🏘️", openingBalanceCents: BASE_OPENING.housing_fund,   isAsset: true  },
    { key: "loan",            name: "民间借贷（借出）", type: ACCT.loan,         icon: "🤝", openingBalanceCents: BASE_OPENING.loan,           isAsset: true  },
    { key: "digital_asset",   name: "数字资产账户",     type: ACCT.digital_asset, icon: "₿",  openingBalanceCents: BASE_OPENING.digital_asset,  isAsset: true  },
    { key: "collectible",     name: "收藏品账户",       type: ACCT.collectible,  icon: "🖼️", openingBalanceCents: BASE_OPENING.collectible,    isAsset: true  },
    // 对齐持仓类型的关联账户候选（基金 / 定期 / 不动产），期初为 0（余额与持仓成本在演示数据中分开造数）/ Linked-account candidates matching holding types (fund / deposit / real_estate), opening 0
    { key: "fund",            name: "基金账户",         type: ACCT.fund,         icon: "📉", openingBalanceCents: BASE_OPENING.fund,            isAsset: true  },
    { key: "savings",         name: "定期存款账户",     type: ACCT.savings,      icon: "🏦", openingBalanceCents: BASE_OPENING.savings,         isAsset: true  },
    { key: "real_estate",     name: "房产账户",         type: ACCT.real_estate,  icon: "🏠", openingBalanceCents: BASE_OPENING.real_estate,     isAsset: true  },
  ];
})();
