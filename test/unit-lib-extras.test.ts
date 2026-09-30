/**
 * ratcount · 工具库纯函数补充测试（unit-lib-extras）
 *
 * 覆盖（现有 unit.test / money.test 未直接覆盖的 lib 层）：
 *  - lib/balance.ts：computeBaseBalanceDelta（基准币种口径，原币版已有 unit.test）
 *  - lib/currency.ts：rateOf / toBaseCents / convertTo（loadCurrencyRates 依赖 DB，由 functional 覆盖）
 *  - lib/tx-currency.ts：resolveTransactionMoney（fake tx 句柄，验证币种解析/跨币种折算/缺省回退）
 *  - lib/runtime.ts + runtime-types.ts：默认 server 模式、isDesktopMode/isServerMode、模式常量
 *  - lib/revalidate.ts：revalidateTxRelated / revalidateInvestmentRelated（钩子捕获 revalidatePath 调用）
 *
 * 运行：npx tsx --test test/unit-lib-extras.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ==================== next/cache 钩子（revalidate 测试用） ==================== */
// 必须在业务模块加载前注册；捕获 revalidatePath 的调用路径，供断言
const Module = require("node:module");
const origJs = Module._extensions[".js"];
const origTs = Module._extensions[".ts"];
let reactCachePatched = false;
const revalidatedPaths: string[] = [];

Module._extensions[".js"] = function (module: any, filename: string) {
  if (!reactCachePatched && /[\\/]node_modules[\\/]react[\\/]/.test(filename)) {
    try {
      if (module.exports && typeof module.exports === "object" && "cache" in module.exports) {
        module.exports.cache = (fn: any) => fn;
        reactCachePatched = true;
      }
    } catch {
      /* 忽略非 react 主入口 */
    }
  }
  if (/[\\/]node_modules[\\/]next[\\/]cache\.js$/.test(filename)) {
    module.exports = {
      revalidatePath: (p: string) => revalidatedPaths.push(p),
      revalidateTag: () => {},
    };
    return;
  }
  if (/[\\/]node_modules[\\/]next[\\/]headers\.js$/.test(filename)) {
    module.exports = {
      cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
      headers: async () => new Headers(),
      draftMode: () => ({ enable: () => {}, disable: () => {} }),
    };
    return;
  }
  return origJs(module, filename);
};

Module._extensions[".ts"] = function (module: any, filename: string) {
  return origTs(module, filename);
};

/* ==================== 被测模块 ==================== */
let computeBaseBalanceDelta: any;
let rateOf: any;
let toBaseCents: any;
let convertTo: any;
let resolveTransactionMoney: any;
let DEPLOY_MODE: any;
let isDesktopMode: any;
let isServerMode: any;
let DEPLOY_MODE_SERVER: any;
let DEPLOY_MODE_DESKTOP: any;
let revalidateTxRelated: any;
let revalidateInvestmentRelated: any;
let TX: any;
let DEFAULT_CURRENCY: any;

test.before(async () => {
  ({ computeBaseBalanceDelta } = await import("../lib/balance"));
  ({ rateOf, toBaseCents, convertTo } = await import("../lib/currency"));
  ({ resolveTransactionMoney } = await import("../lib/tx-currency"));
  ({ DEPLOY_MODE, isDesktopMode, isServerMode } = await import("../lib/runtime"));
  ({ DEPLOY_MODE_SERVER, DEPLOY_MODE_DESKTOP } = await import("../lib/runtime-types"));
  ({ revalidateTxRelated, revalidateInvestmentRelated } = await import("../lib/revalidate"));
  ({ TX, DEFAULT_CURRENCY } = await import("../lib/constants"));
});

/* ==================== balance：基准币种口径 ==================== */

test("computeBaseBalanceDelta: 收入+/支出-/转账出-入+（基准币种）", () => {
  const delta = computeBaseBalanceDelta([
    { accountId: "a", toAccountId: null, type: TX.income, baseAmountCents: 10000 },
    { accountId: "a", toAccountId: null, type: TX.expense, baseAmountCents: 3000 },
    { accountId: "b", toAccountId: null, type: TX.expense, baseAmountCents: 5000 },
    { accountId: "a", toAccountId: "b", type: TX.transfer, baseAmountCents: 2000 },
  ]);
  // a: +10000 -3000 -2000 = +5000；b: -5000 +2000 = -3000
  assert.strictEqual(delta.get("a"), 5000);
  assert.strictEqual(delta.get("b"), -3000);
});

test("computeBaseBalanceDelta: 跨币种转账入账基准金额按来源侧 base 计（不额外折算）", () => {
  const delta = computeBaseBalanceDelta([
    { accountId: "usd", toAccountId: "cny", type: TX.transfer, baseAmountCents: 72000 },
  ]);
  assert.strictEqual(delta.get("usd"), -72000);
  assert.strictEqual(delta.get("cny"), 72000);
});

test("computeBaseBalanceDelta: 缺省 baseAmountCents 按 0 计，null 账户跳过", () => {
  const delta = computeBaseBalanceDelta([
    { accountId: "a", toAccountId: null, type: TX.income },
    { accountId: null, toAccountId: null, type: TX.income, baseAmountCents: 999 },
  ]);
  assert.strictEqual(delta.get("a"), 0);
  assert.strictEqual(delta.size, 1);
  assert.strictEqual(computeBaseBalanceDelta([]).size, 0);
});

/* ==================== currency：汇率与折算 ==================== */

test("rateOf: 存在返回汇率，缺失回退 1", () => {
  const rates = new Map([["USD", "7.2"], ["EUR", "7.8"]]);
  assert.strictEqual(rateOf(rates, "USD"), "7.2");
  assert.strictEqual(rateOf(rates, "JPY"), "1");
});

test("toBaseCents: 原币金额按汇率折算基准币种分（整数定点）", () => {
  // 100 美元 = 10000 分 × 7.2 = 72000 分
  assert.strictEqual(toBaseCents(10000, "7.2"), 72000);
  assert.strictEqual(toBaseCents(10000, "1"), 10000);
});

test("convertTo: 跨币种折算（fromRate/toRate）", () => {
  // 100 美元(rate 7.2) → 欧元(rate 7.8)：10000 × 7.2 / 7.8 = 9230.77 → 四舍五入 9231
  assert.strictEqual(convertTo(10000, "7.2", "7.8"), 9231);
  assert.strictEqual(convertTo(10000, "7.2", "1"), 72000);
  assert.strictEqual(convertTo(10000, "1", "1"), 10000);
});

/* ==================== tx-currency：流水币种字段解析 ==================== */

function fakeTx(accts: Array<{ id: string; currencyCode: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: async () => accts,
      }),
    }),
  };
}

test("resolveTransactionMoney: 单账户支出取账户币种与基准折算", async () => {
  const tx = fakeTx([{ id: "ac-usd", currencyCode: "USD" }]);
  const r = await resolveTransactionMoney(tx as any, "l1", {
    accountId: "ac-usd",
    toAccountId: null,
    amountCents: 10000,
    type: TX.expense,
    rates: new Map([["USD", "7.2"]]),
  });
  assert.strictEqual(r.currencyCode, "USD");
  assert.strictEqual(r.toCurrencyCode, null);
  assert.strictEqual(r.usedRateFrom, "7.2");
  assert.strictEqual(r.usedRateTo, null);
  assert.strictEqual(r.toAmountCents, null);
  assert.strictEqual(r.baseAmountCents, 72000);
});

test("resolveTransactionMoney: 同币种转账 toAmountCents 回退原金额", async () => {
  const tx = fakeTx([
    { id: "a", currencyCode: "CNY" },
    { id: "b", currencyCode: "CNY" },
  ]);
  const r = await resolveTransactionMoney(tx as any, "l1", {
    accountId: "a",
    toAccountId: "b",
    amountCents: 5000,
    type: TX.transfer,
    rates: new Map([["CNY", "1"]]),
  });
  assert.strictEqual(r.toAmountCents, 5000);
  assert.strictEqual(r.toCurrencyCode, "CNY");
  assert.strictEqual(r.usedRateTo, "1");
  assert.strictEqual(r.baseAmountCents, 5000);
});

test("resolveTransactionMoney: 跨币种转账目标入账按汇率折算", async () => {
  const tx = fakeTx([
    { id: "usd", currencyCode: "USD" },
    { id: "eur", currencyCode: "EUR" },
  ]);
  const r = await resolveTransactionMoney(tx as any, "l1", {
    accountId: "usd",
    toAccountId: "eur",
    amountCents: 10000,
    type: TX.transfer,
    rates: new Map([["USD", "7.2"], ["EUR", "7.8"]]),
  });
  assert.strictEqual(r.currencyCode, "USD");
  assert.strictEqual(r.toCurrencyCode, "EUR");
  assert.strictEqual(r.usedRateFrom, "7.2");
  assert.strictEqual(r.usedRateTo, "7.8");
  assert.strictEqual(r.toAmountCents, 9231);
  assert.strictEqual(r.baseAmountCents, 72000);
});

test("resolveTransactionMoney: 目标账户缺失回退默认币种与汇率 1", async () => {
  const tx = fakeTx([{ id: "a", currencyCode: "CNY" }]);
  const r = await resolveTransactionMoney(tx as any, "l1", {
    accountId: "a",
    toAccountId: "ghost",
    amountCents: 1000,
    type: TX.transfer,
    rates: new Map(),
  });
  assert.strictEqual(r.toCurrencyCode, DEFAULT_CURRENCY);
  assert.strictEqual(r.usedRateTo, "1");
  assert.strictEqual(r.toAmountCents, 1000);
});

/* ==================== runtime：部署模式 ==================== */

test("runtime: 默认 server 模式（未设 NEXT_PUBLIC_DEPLOY_MODE）", () => {
  assert.strictEqual(DEPLOY_MODE, DEPLOY_MODE_SERVER);
  assert.strictEqual(DEPLOY_MODE_SERVER, "server");
  assert.strictEqual(DEPLOY_MODE_DESKTOP, "desktop");
  assert.strictEqual(isDesktopMode, false);
  assert.strictEqual(isServerMode, true);
});

/* ==================== revalidate：缓存失效收口 ==================== */

test("revalidateTxRelated: 固定刷新 流水/首页/报表/余额 四张", () => {
  revalidatedPaths.length = 0;
  revalidateTxRelated();
  const expected = ["/transactions", "/dashboard", "/reports", "/balance"];
  assert.deepStrictEqual([...revalidatedPaths].sort(), [...expected].sort());
});

test("revalidateInvestmentRelated: 带 type 刷新投资总览+类型列表+首页+流水", () => {
  revalidatedPaths.length = 0;
  revalidateInvestmentRelated("fund");
  assert.ok(revalidatedPaths.includes("/investments"));
  assert.ok(revalidatedPaths.includes("/investments/funds"), "应刷新具体类型列表");
  assert.ok(revalidatedPaths.includes("/dashboard"));
  assert.ok(revalidatedPaths.includes("/transactions"));
  assert.strictEqual(revalidatedPaths.length, 4);
});

test("revalidateInvestmentRelated: 不带 type 不刷新具体类型列表", () => {
  revalidatedPaths.length = 0;
  revalidateInvestmentRelated();
  assert.ok(revalidatedPaths.includes("/investments"));
  assert.ok(!revalidatedPaths.some((p) => p.includes("/investments/") && p !== "/investments"));
  assert.strictEqual(revalidatedPaths.length, 3);
});
