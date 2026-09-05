/**
 * ratcount · 单元测试（验证码 / 登录限流 / 余额计算）
 * 运行：npx tsx --test test/unit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generateCaptchaCode,
  createCaptchaToken,
  verifyCaptchaToken,
  renderCaptchaSvg,
} from "../lib/auth/captcha";
import {
  allowAttempt,
  remainingAttempts,
  resetAttempts,
} from "../lib/auth/rate-limit";
import { computeBalanceDelta } from "../lib/queries";
import { nextRecurringDate, parseDate, fmtDate } from "../lib/recurring";

/* ==================== 1. 验证码 ==================== */

test("验证码: 生成 4 位且只含安全字符集", () => {
  const code = generateCaptchaCode();
  assert.strictEqual(code.length, 4);
  // 不应出现易混淆字符 0/O/1/I
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
});

test("验证码: 多次生成非恒定（有随机性）", () => {
  const set = new Set(Array.from({ length: 50 }, () => generateCaptchaCode()));
  assert.ok(set.size > 1, "50 次生成应出现多种取值");
});

test("验证码: token 签名与校验（大小写不敏感）", async () => {
  const code = "AB12";
  const token = await createCaptchaToken(code);
  assert.strictEqual(await verifyCaptchaToken(token, code), true);
  assert.strictEqual(await verifyCaptchaToken(token, "ab12"), true); // 小写也通过
  assert.strictEqual(await verifyCaptchaToken(token, " ab12 "), true); // 首尾空格容忍
  assert.strictEqual(await verifyCaptchaToken(token, "CD34"), false); // 错误答案
});

test("验证码: 伪造/篡改 token 校验失败", async () => {
  const token = await createCaptchaToken("WXYZ");
  // 篡改 payload 或签名 → jwtVerify 抛错 → false
  assert.strictEqual(await verifyCaptchaToken(token + "x", "WXYZ"), false);
  assert.strictEqual(await verifyCaptchaToken("not-a-jwt", "WXYZ"), false);
});

test("验证码: SVG 渲染包含明文每个字符", () => {
  const code = "K2M9";
  const svg = renderCaptchaSvg(code);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("</svg>"));
  for (const ch of code) assert.ok(svg.includes(`>${ch}</text>`), `应包含字符 ${ch}`);
});

/* ==================== 2. 登录限流 ==================== */

test("限流: 15 分钟内最多 5 次失败，第 6 次被拒", () => {
  const key = "login:test-ip-1";
  resetAttempts(key);
  for (let i = 1; i <= 5; i++) {
    assert.strictEqual(allowAttempt(key), true, `第 ${i} 次应放行`);
  }
  assert.strictEqual(allowAttempt(key), false, "第 6 次应被拒");
  assert.strictEqual(remainingAttempts(key), 0, "剩余次数为 0");
});

test("限流: remainingAttempts 随失败递减，成功后重置", () => {
  const key = "login:test-ip-2";
  resetAttempts(key);
  assert.strictEqual(remainingAttempts(key), 5);
  allowAttempt(key); // 1 次失败
  assert.strictEqual(remainingAttempts(key), 4);
  resetAttempts(key); // 登录成功
  assert.strictEqual(remainingAttempts(key), 5);
  assert.strictEqual(allowAttempt(key), true);
});

test("限流: 不同 IP 相互独立", () => {
  const k1 = "login:ip-a";
  const k2 = "login:ip-b";
  resetAttempts(k1);
  resetAttempts(k2);
  for (let i = 0; i < 5; i++) allowAttempt(k1);
  assert.strictEqual(allowAttempt(k1), false, "ip-a 被限流");
  assert.strictEqual(allowAttempt(k2), true, "ip-b 不受影响");
});

/* ==================== 3. 余额计算 ==================== */

test("余额计算: 收入加、支出减、转账出一进一（不计收支）", () => {
  const txs = [
    { accountId: "a", toAccountId: null, type: "income", amountCents: 10000, txDate: "2026-09-01" },
    { accountId: "a", toAccountId: null, type: "expense", amountCents: 3000, txDate: "2026-09-02" },
    { accountId: "a", toAccountId: "b", type: "transfer", amountCents: 5000, txDate: "2026-09-03" },
  ];
  const delta = computeBalanceDelta(txs);
  // a: +10000 -3000 -5000 = +2000；b: +5000
  assert.strictEqual(delta.get("a"), 2000);
  assert.strictEqual(delta.get("b"), 5000);
});

test("余额计算: 转账不改总资产（A 减 = B 加）", () => {
  const txs = [
    { accountId: "x", toAccountId: "y", type: "transfer", amountCents: 12345, txDate: "2026-09-05" },
  ];
  const delta = computeBalanceDelta(txs);
  assert.strictEqual(delta.get("x"), -12345);
  assert.strictEqual(delta.get("y"), 12345);
  const total = [...delta.values()].reduce((s, v) => s + v, 0);
  assert.strictEqual(total, 0, "转账合计为 0");
});

test("余额计算: 空流水与仅收入边界", () => {
  assert.strictEqual(computeBalanceDelta([]).size, 0);
  const delta = computeBalanceDelta([
    { accountId: "z", toAccountId: null, type: "income", amountCents: 1, txDate: "2026-09-01" },
  ]);
  assert.strictEqual(delta.get("z"), 1);
});

test("余额计算: null 账户 id 被安全跳过", () => {
  const delta = computeBalanceDelta([
    { accountId: null, toAccountId: null, type: "income", amountCents: 999, txDate: "2026-09-01" },
  ]);
  assert.strictEqual(delta.size, 0);
});

/* ==================== 4. 周期计划日期推进 ==================== */

test("周期: 每天 +1 天", () => {
  assert.strictEqual(nextRecurringDate("daily", "2026-09-30"), "2026-10-01");
  assert.strictEqual(nextRecurringDate("daily", "2026-02-28"), "2026-03-01");
});

test("周期: 每周 +7 天", () => {
  assert.strictEqual(nextRecurringDate("weekly", "2026-09-05"), "2026-09-12");
});

test("周期: 每周跳到指定星期几", () => {
  // 2026-09-05 是周六(6)；目标周一(1) → 下一周周一 09-07
  assert.strictEqual(nextRecurringDate("weekly", "2026-09-05", { dayOfWeek: 1 }), "2026-09-07");
  // 目标同一天(6) → 一周后 09-12
  assert.strictEqual(nextRecurringDate("weekly", "2026-09-05", { dayOfWeek: 6 }), "2026-09-12");
});

test("周期: 每月按指定号数（跨月/年末/超月取月末）", () => {
  assert.strictEqual(nextRecurringDate("monthly", "2026-01-15", { dayOfMonth: 15 }), "2026-02-15");
  assert.strictEqual(nextRecurringDate("monthly", "2026-12-10", { dayOfMonth: 10 }), "2027-01-10");
  // 2 月无 31 号 → 取 2 月末 28
  assert.strictEqual(nextRecurringDate("monthly", "2026-01-31", { dayOfMonth: 31 }), "2026-02-28");
  // 2028 闰年 2 月 29
  assert.strictEqual(nextRecurringDate("monthly", "2028-01-31", { dayOfMonth: 31 }), "2028-02-29");
});

test("周期: 每年 +1 年（2/29 → 2/28）", () => {
  assert.strictEqual(nextRecurringDate("yearly", "2026-09-05"), "2027-09-05");
  assert.strictEqual(nextRecurringDate("yearly", "2024-02-29"), "2025-02-28");
});

test("周期: 日期解析与格式化往返", () => {
  assert.strictEqual(fmtDate(parseDate("2026-09-05")), "2026-09-05");
  assert.strictEqual(fmtDate(parseDate("2026-01-01")), "2026-01-01");
});
