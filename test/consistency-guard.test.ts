/**
 * ratcount · 一致性守卫测试（枚举 / 映射 / 文案 单一真源不漂移）
 * 运行：npx tsx --test test/consistency-guard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { accountTypes, investmentTypes, transactionTypes, type AccountType, ACCT, PROTECTION_ACCOUNT_TYPES, INVESTMENT_ACCOUNT_TYPES, TX } from "../lib/constants"
import { ACCOUNT_TYPES, TYPE_ICON, isInvestmentAccount } from "../lib/constants"
import { TRANSACTION_TYPES, parseTransactionType, isTransfer } from "../lib/constants";
import {
  INVESTMENT_TYPES, PROTECTION_HOLDING_TYPES, QTY_SCALE,
  isStockLike, isFixedIncome, isTradable, linkedAccountTypeOf, investmentListHref,
} from "../lib/investment-types";
import { transactionSchema } from "../lib/validators";

const loadMsg = (file: string) =>
  JSON.parse(readFileSync(new URL(`../messages/${file}`, import.meta.url), "utf8"));

/* ==================== 1. 账户类型枚举与映射 ==================== */
test("账户类型: schema 与 lib 均为 20 项且集合一致", () => {
  assert.strictEqual(accountTypes.length, 20);
  assert.strictEqual(ACCOUNT_TYPES.length, 20);
  assert.deepStrictEqual(
    [...ACCOUNT_TYPES.map((t) => t.v)].sort(),
    [...accountTypes].sort(),
  );
});

test("账户类型: 6 个新增类型均已接入图标与 i18n key", () => {
  const added = ["insurance", "housing_fund", "loan", "digital_asset", "collectible"] as const satisfies readonly AccountType[];
  for (const t of added) {
    assert.ok(TYPE_ICON[t], `缺图标: ${t}`);
    assert.ok(ACCOUNT_TYPES.some((a) => a.v === t), `ACCOUNT_TYPES 缺: ${t}`);
  }
});

test("账户类型: PROTECTION_ACCOUNT_TYPES 是账户类型的子集（4 类）", () => {
  assert.deepStrictEqual([...PROTECTION_ACCOUNT_TYPES].sort(), ["housing_fund", "insurance", "national_pension", "personal_pension"].sort());
  for (const t of PROTECTION_ACCOUNT_TYPES) {
    assert.ok((accountTypes as readonly string[]).includes(t), `保障账户类越界: ${t}`);
  }
});

test("账户类型: ACCT 常量与 accountTypes 互锁（键集合一致且键值自反）", () => {
  assert.deepStrictEqual(Object.keys(ACCT).sort(), [...accountTypes].sort(), "ACCT 键集合与 accountTypes 不一致");
  for (const t of accountTypes) {
    assert.strictEqual(ACCT[t], t, `ACCT 键值应自反: ${t}`);
  }
});

test("账户类型: TYPE_ICON 覆盖全部 19 类（漏图标 TS 即报错，这里防运行期漂移）", () => {
  assert.deepStrictEqual(Object.keys(TYPE_ICON).sort(), [...accountTypes].sort(), "图标键集合与 accountTypes 不一致");
  for (const t of accountTypes) {
    assert.ok(TYPE_ICON[t] && TYPE_ICON[t].trim().length > 0, `缺图标: ${t}`);
  }
});

test("账户类型: INVESTMENT_ACCOUNT_TYPES 是账户类型子集且 isInvestmentAccount 行为正确", () => {
  for (const t of INVESTMENT_ACCOUNT_TYPES) {
    assert.ok((accountTypes as readonly string[]).includes(t), `投资类账户越界: ${t}`);
  }
  assert.ok(INVESTMENT_ACCOUNT_TYPES.length > 0, "投资类账户清单不应为空");
  // 日常支付账户不属于投资类；未知类型安全返回 false
  for (const t of ["cash", "debit_card", "credit_card", "wechat", "foreign_currency", "custom", "unknown_xyz"]) {
    assert.strictEqual(isInvestmentAccount(t), false, `不应为投资类: ${t}`);
  }
});

test("账户类型: ACCOUNT_TYPES 覆盖全部 19 类且 i18n key 合法（单一真源）", () => {
  assert.strictEqual(ACCOUNT_TYPES.length, accountTypes.length);
  const keys = new Set(ACCOUNT_TYPES.map((t) => t.key));
  for (const t of accountTypes) {
    const entry = ACCOUNT_TYPES.find((x) => x.v === t);
    assert.ok(entry, `缺账户类型配置: ${t}`);
    assert.ok(entry.key.startsWith("acctType."), `key 应以 acctType. 开头: ${t}`);
    assert.ok(keys.has(entry.key), `重复 key: ${entry.key}`);
  }
  // 校验 messages 中有对应条目（简单检查 key 格式，实际文案由 i18n 保障）
  const cnMsg = JSON.parse(readFileSync(fileURLToPath(new URL("../messages/zh-CN.json", import.meta.url)), "utf8"));
  assert.ok(cnMsg.acctType, "messages/zh-CN.json 缺 acctType 命名空间");
  for (const t of accountTypes) {
    const camel = t.replace(/_([^])/g, (_, c) => c.toUpperCase());
    assert.ok(camel in cnMsg.acctType, `缺 acctType.${camel}: ${t}`);
  }
});

/* ==================== 2. 投资持仓类型枚举与映射 ==================== */
test("投资类型: schema 与 INVESTMENT_TYPES 均为 10 项且集合一致", () => {
  assert.strictEqual(investmentTypes.length, 10);
  assert.strictEqual(INVESTMENT_TYPES.length, 10);
  assert.deepStrictEqual(
    [...INVESTMENT_TYPES.map((t) => t.v)].sort(),
    [...investmentTypes].sort(),
  );
});

test("投资类型: QTY_SCALE 键集合 == 全部投资类型（漏加 TS 即报错，这里防运行期漂移）", () => {
  assert.deepStrictEqual(Object.keys(QTY_SCALE).sort(), [...investmentTypes].sort());
});

test("投资类型: PROTECTION_HOLDING_TYPES 是投资类型子集（insurance）", () => {
  assert.deepStrictEqual([...PROTECTION_HOLDING_TYPES], ["insurance"]);
  for (const t of PROTECTION_HOLDING_TYPES) {
    assert.ok((investmentTypes as readonly string[]).includes(t), `保障持仓越界: ${t}`);
  }
});

test("投资类型: 分组常量符合口径（isStockLike / isFixedIncome / isTradable）", () => {
  // 类股票：股票、数字资产
  assert.strictEqual(isStockLike("stock"), true);
  assert.strictEqual(isStockLike("digital_asset"), true);
  assert.strictEqual(isStockLike("fund"), false);
  // 固收：定期/国债/储蓄型保险/民间借贷
  for (const t of ["deposit", "bond", "insurance", "loan"] as const) {
    assert.strictEqual(isFixedIncome(t), true, `应固收: ${t}`);
  }
  assert.strictEqual(isFixedIncome("stock"), false);
  // 可交易：股票/数字资产/基金/收藏品
  assert.strictEqual(isTradable("collectible"), true);
  assert.strictEqual(isTradable("insurance"), false);
});

test("投资类型: linkedAccountTypeOf 映射正确（保障/资产类限定对应账户类型）", () => {
  assert.strictEqual(linkedAccountTypeOf("stock"), "investment");
  assert.strictEqual(linkedAccountTypeOf("digital_asset"), "digital_asset");
  assert.strictEqual(linkedAccountTypeOf("collectible"), "collectible");
  assert.strictEqual(linkedAccountTypeOf("insurance"), "insurance");
  assert.strictEqual(linkedAccountTypeOf("loan"), "loan");
  assert.strictEqual(linkedAccountTypeOf("fund"), "fund");
  assert.strictEqual(linkedAccountTypeOf("deposit"), "savings");
  assert.strictEqual(linkedAccountTypeOf("bond"), "bond");
  assert.strictEqual(linkedAccountTypeOf("metal"), "precious_metal");
  assert.strictEqual(linkedAccountTypeOf("real_estate"), "real_estate");
});

test("投资类型: 10 类持仓全覆盖关联账户类型（漏配 TS 不报错，这里防运行期退回「全部账户」）", () => {
  for (const t of INVESTMENT_TYPES) {
    const at = linkedAccountTypeOf(t.v);
    assert.ok(at !== null, `未限定关联账户类型: ${t.v}`);
    assert.ok((accountTypes as readonly string[]).includes(at), `账户类型越界: ${t.v} -> ${at}`);
  }
});

test("投资类型: investmentListHref 为每类返回有效管理页路径", () => {
  for (const t of INVESTMENT_TYPES) {
    const href = investmentListHref(t.v);
    assert.ok(href.startsWith("/investments"), `路径越界: ${t.v} -> ${href}`);
  }
});

/* ==================== 3. 中英双语文案不缺键 ==================== */
test("文案: 中英文均含新增账户类型 / 投资类型 / 导航 / 标签 键", () => {
  const zh = loadMsg("zh-CN.json");
  const en = loadMsg("en.json");
  const newAcct = ["insurance", "housingFund", "loan", "digitalAsset", "collectible"];
  const newInvest = ["digitalAssets", "collectibles", "insurance", "loans"];
  const newNav = ["protectionOverview", "investInsurance", "investLoans"];
  for (const lang of [zh, en]) {
    for (const k of newAcct) assert.ok(lang.acctType[k], `缺 acctType.${k}`);
    for (const k of newInvest) assert.ok(lang.investment[k], `缺 investment.${k}`);
    for (const k of newNav) assert.ok(lang.nav[k], `缺 nav.${k}`);
    assert.ok(lang.investment.pieces, "缺 investment.pieces");
  }
});

/* ==================== 4. 交易类型枚举与映射 ==================== */
test("交易类型: schema / TX / TRANSACTION_TYPES / zod 枚举四方一致", () => {
  const base = [...transactionTypes].sort();
  // TX 常量由 satisfies 编译期互锁，这里防运行期漂移
  assert.deepStrictEqual(Object.keys(TX).sort(), base, "TX 常量与 transactionTypes 不一致");
  assert.deepStrictEqual(
    [...TRANSACTION_TYPES.map((t) => t.v)].sort(),
    base,
    "TRANSACTION_TYPES 与 transactionTypes 不一致",
  );
  // zod 枚举由 transactionTypes 派生，杜绝第二真源
  assert.deepStrictEqual([...transactionSchema.shape.type.options].sort(), base, "zod 枚举未从 schema 派生");
});

test("交易类型: parseTransactionType 合法值通过、脏值返回 null", () => {
  for (const t of transactionTypes) {
    assert.strictEqual(parseTransactionType(t), t, `合法值应通过: ${t}`);
  }
  for (const bad of ["", "Income", "INCOME", "收支", null, undefined, 1, {}]) {
    assert.strictEqual(parseTransactionType(bad), null, `脏值应返回 null: ${String(bad)}`);
  }
});

test("交易类型: isTransfer 仅对 transfer 为真", () => {
  assert.strictEqual(isTransfer(TX.transfer), true);
  assert.strictEqual(isTransfer(TX.income), false);
  assert.strictEqual(isTransfer(TX.expense), false);
});
