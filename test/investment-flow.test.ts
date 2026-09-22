/** 投资 ↔ 流水联动纯函数单测 / Investment-flow pure-function unit tests */
import { test } from "node:test";
import assert from "node:assert";
import {
  parseAnnualRate,
  daysBetween,
  actualCostCents,
  calcMaturityCents,
  profitCents,
  prorateSell,
  defaultMaturityCents,
  estimateAccruedCents,
  isDateStr,
  todayStr,
} from "../lib/investment-flow";

test("parseAnnualRate: 百分数文本 → 年利率小数", () => {
  // 2.60 / 100 存在浮点尾差，用近似比较
  const near = (actual: number | null, expected: number) =>
    assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
  near(parseAnnualRate("2.60%"), 0.026);
  near(parseAnnualRate("2.60"), 0.026);
  assert.strictEqual(parseAnnualRate(" 3% "), 0.03);
  assert.strictEqual(parseAnnualRate("0"), 0);
});

test("parseAnnualRate: 非法输入返回 null", () => {
  assert.strictEqual(parseAnnualRate(null), null);
  assert.strictEqual(parseAnnualRate(undefined), null);
  assert.strictEqual(parseAnnualRate(""), null);
  assert.strictEqual(parseAnnualRate("abc"), null);
  assert.strictEqual(parseAnnualRate("%"), null);
});

test("daysBetween: UTC 天数差（跨月/跨年/同日）", () => {
  assert.strictEqual(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.strictEqual(daysBetween("2026-01-01", "2026-01-01"), 0);
  assert.strictEqual(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.strictEqual(daysBetween("2024-02-28", "2024-03-01"), 2); // 闰年
});

test("daysBetween: 非法日期返回 null", () => {
  assert.strictEqual(daysBetween("2026-1-1", "2026-01-02"), null);
  assert.strictEqual(daysBetween(null as unknown as string, "2026-01-02"), null);
});

test("isDateStr / todayStr: 日期格式校验与当天", () => {
  assert.strictEqual(isDateStr("2026-09-07"), true);
  assert.strictEqual(isDateStr("2026-9-7"), false);
  assert.strictEqual(isDateStr(null), false);
  assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
});

test("actualCostCents: 实际成本 = 成本 + 费用", () => {
  assert.strictEqual(actualCostCents(120000, 3456), 123456);
  assert.strictEqual(actualCostCents(100000, 0), 100000);
});

test("calcMaturityCents: 单利按天计息", () => {
  // 本金 1000 元，年利率 2.6%，存满 365 天 → 本息 1026 元
  assert.strictEqual(calcMaturityCents(100000, 0.026, 365), 102600);
  // 半年（182 天）→ 约 1012.96 元
  assert.strictEqual(calcMaturityCents(100000, 0.026, 182), 101296);
  // 天数非正 → 只还本金
  assert.strictEqual(calcMaturityCents(100000, 0.026, 0), 100000);
  assert.strictEqual(calcMaturityCents(100000, 0.026, -10), 100000);
});

test("profitCents: 盈亏 = 到账金额 − 实际成本", () => {
  assert.strictEqual(profitCents(80000, 60000), 20000); // 赚
  assert.strictEqual(profitCents(50000, 60000), -10000); // 亏
  assert.strictEqual(profitCents(60000, 60000), 0); // 持平
});

test("defaultMaturityCents: 按利率自动算到期额", () => {
  const cents = defaultMaturityCents({
    principalCents: 100000,
    interestRate: "2.60%",
    startDate: "2026-01-01",
    maturityDate: "2027-01-01",
    fallbackCents: 999999,
  });
  assert.strictEqual(cents, 102600);
});

test("defaultMaturityCents: 利率或起息日缺失时回退当前市值", () => {
  const base = { principalCents: 100000, startDate: "2026-01-01", maturityDate: "2027-01-01", fallbackCents: 888888 };
  assert.strictEqual(defaultMaturityCents({ ...base, interestRate: null }), 888888);
  assert.strictEqual(defaultMaturityCents({ ...base, interestRate: "abc" }), 888888);
  assert.strictEqual(defaultMaturityCents({ ...base, interestRate: "2.60%", startDate: null }), 888888);
});

test("estimateAccruedCents: 未到期算到今天（应计本息），不到满期", () => {
  // 10 万本金 / 2.6% / 2026-01-01 起息，今天 2026-07-01（181 天）
  const cents = estimateAccruedCents({
    principalCents: 100000,
    interestRate: "2.60%",
    startDate: "2026-01-01",
    maturityDate: "2027-01-01",
    today: "2026-07-01",
  });
  assert.strictEqual(cents, calcMaturityCents(100000, 0.026, 181));
  assert.ok(cents < 102600, "未到期应少于满期本息");
});

test("estimateAccruedCents: 到期日已过 → 按到期日算满期", () => {
  const cents = estimateAccruedCents({
    principalCents: 100000,
    interestRate: "2.60%",
    startDate: "2026-01-01",
    maturityDate: "2026-07-01",
    today: "2026-09-19",
  });
  assert.strictEqual(cents, calcMaturityCents(100000, 0.026, 181));
});

test("estimateAccruedCents: 利率 / 起息日缺失回退本金，天数非正也回退本金", () => {
  const base = { principalCents: 100000, interestRate: "2.60%", startDate: "2026-01-01", maturityDate: "2027-01-01", today: "2026-07-01" };
  assert.strictEqual(estimateAccruedCents({ ...base, interestRate: null }), 100000);
  assert.strictEqual(estimateAccruedCents({ ...base, interestRate: "abc" }), 100000);
  assert.strictEqual(estimateAccruedCents({ ...base, startDate: null }), 100000);
  // 起息日在今天之后（天数非正）→ 只还本金
  assert.strictEqual(estimateAccruedCents({ ...base, startDate: "2026-08-01" }), 100000);
});

test("账目推演：买入 600 → 卖出 800，拆分记账使净资产正确 +200", () => {
  // 扣款账户初始 1000 元，关联账户 0
  let payment = 100000;
  let linked = 0;
  const cost = actualCostCents(60000, 0); // 成本 600 元
  const sell = 80000; // 卖出 800 元

  // 1) 买入 transfer：扣款账户 → 关联账户（两侧合计不变）
  payment -= cost;
  linked += cost;
  assert.strictEqual(payment + linked, 100000);

  // 2) 卖出 transfer：关联账户 → 扣款账户，转回成本（关联账户归零）
  linked -= cost;
  payment += cost;
  assert.strictEqual(linked, 0);

  // 3) 盈亏单独记 income：这一步才让净资产增长
  const profit = profitCents(sell, cost);
  assert.strictEqual(profit, 20000);
  payment += profit;

  // 净资产由 1000 → 1200，收益 200 正确体现
  assert.strictEqual(payment + linked, 120000);
});

test("defaultMaturityCents: 到期日缺失时用今天（不抛错）", () => {
  const cents = defaultMaturityCents({
    principalCents: 100000,
    interestRate: "3.65%",
    startDate: "2020-01-01",
    maturityDate: null,
    fallbackCents: 0,
  });
  assert.ok(cents > 100000, "持有多年后本息应大于本金");
});

/* ==================== 部分卖出：成本比例结转 ==================== */

/** 持仓样例：500 股，成本 10000 元，费用 50 元，市值 12000 元 */
const HOLDING = { quantity: 500, costCents: 1_000_000, feeCents: 5_000, currentValueCents: 1_200_000 };

test("prorateSell: 整仓卖出（数量缺省 0 或等于持仓量）结转全部成本", () => {
  const whole = prorateSell(HOLDING, 0);
  assert.strictEqual(whole.ratio, 1);
  assert.strictEqual(whole.costPart, HOLDING.costCents);
  assert.strictEqual(whole.feePart, HOLDING.feeCents);
  assert.strictEqual(whole.cost, HOLDING.costCents + HOLDING.feeCents);
  assert.strictEqual(whole.isFull, true);
  assert.strictEqual(whole.remainingQuantity, HOLDING.quantity);
  assert.strictEqual(whole.remainingValueCents, HOLDING.currentValueCents);

  const exact = prorateSell(HOLDING, HOLDING.quantity);
  assert.strictEqual(exact.isFull, true);
  assert.strictEqual(exact.cost, HOLDING.costCents + HOLDING.feeCents);
});

test("prorateSell: 部分卖出按比例结转，结转+剩余恒等于原值（无漂移）", () => {
  const s = prorateSell(HOLDING, 200); // 卖出 200/500 = 40%
  assert.strictEqual(s.ratio, 0.4);
  assert.strictEqual(s.costPart, 400_000);
  assert.strictEqual(s.feePart, 2_000);
  assert.strictEqual(s.cost, 402_000);
  assert.strictEqual(s.isFull, false);
  assert.strictEqual(s.remainingQuantity, 300);
  assert.strictEqual(s.remainingCostCents, 600_000);
  assert.strictEqual(s.remainingFeeCents, 3_000);
  assert.strictEqual(s.remainingValueCents, 720_000); // 剩余市值按同比例扣减
  assert.strictEqual(s.costPart + s.remainingCostCents, HOLDING.costCents);
  assert.strictEqual(s.feePart + s.remainingFeeCents, HOLDING.feeCents);
});

test("prorateSell: 无数量口径（quantity = 0，如定期/不动产）视为整仓", () => {
  const s = prorateSell({ quantity: 0, costCents: 100_000, feeCents: 0, currentValueCents: 120_000 }, 0);
  assert.strictEqual(s.isFull, true);
  assert.strictEqual(s.cost, 100_000);
  assert.strictEqual(s.remainingQuantity, 0);
  assert.strictEqual(s.remainingValueCents, 120_000);
});

test("prorateSell: 贵金属小数克数（12.5 克卖 5 克）", () => {
  // 存储口径：克 ×100 → 12.5 克 = 1250，卖 5 克 = 500
  const s = prorateSell({ quantity: 1250, costCents: 500_000, feeCents: 0, currentValueCents: 520_000 }, 500);
  assert.strictEqual(s.ratio, 0.4);
  assert.strictEqual(s.costPart, 200_000);
  assert.strictEqual(s.remainingQuantity, 750);
  assert.strictEqual(s.remainingValueCents, 312_000);
});

test("部分卖出账目推演：到账净额 − 结转成本 = 盈亏", () => {
  // 卖 200 股：成交 5000 元、卖出费用 5 元 → 到账净额 4995 元；结转实际成本 4020 元 → 赚 975 元
  const s = prorateSell(HOLDING, 200);
  const netCents = 500_000 - 500;
  assert.strictEqual(profitCents(netCents, s.cost), 97_500);
  // 剩余持仓留在账户上：300 股 + 成本费用合计 6030 元
  assert.strictEqual(s.remainingQuantity, 300);
  assert.strictEqual(s.remainingCostCents + s.remainingFeeCents, 603_000);
});
