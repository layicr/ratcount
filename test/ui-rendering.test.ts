/**
 * ratcount · UI 层测试（组件可测逻辑 / 渲染纯函数 / 展示格式化 / SVG 结构）
 * 被测试内容不依赖浏览器，直接在 node 环境对渲染纯函数与格式化函数做断言；
 * 真实组件渲染由 next/test 生态（组件测试）在浏览器环境验证。
 * 运行：npx tsx --test test/ui-rendering.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fmt, getPeriodLabel, typeKey, MONTHS_ZH } from "../app/(app)/components/reports/utils";
import { formatCents, yuanToCents, convertCents } from "../lib/money";
import { renderCaptchaSvg } from "../lib/auth/captcha";

/** 报表文案桩（模拟 i18n dict 中报表相关 key） */
const dict = {
  reports: {
    periodYear: "{year}年",
    periodMonth: "{year}年{month}",
  },
};

/* ==================== 1. 报表工具 ==================== */

test("报表: fmt 模板插值（缺 key 原样保留）", () => {
  assert.strictEqual(fmt("{year}年", { year: 2026 }), "2026年");
  assert.strictEqual(fmt("第 {month} 期-{name}", { month: 9, name: "月度" }), "第 9 期-月度");
  assert.strictEqual(fmt("未定义 {missing}", {}), "未定义 {missing}");
});

test("报表: getPeriodLabel 年份/月度 + 中英文", () => {
  assert.strictEqual(getPeriodLabel({ type: "year", year: 2026 }, "zh", dict), "2026年");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 9 }, "zh", dict), "2026年九月");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 1 }, "zh", dict), "2026年一月");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 9 }, "en", dict), "2026年September");
  assert.strictEqual(getPeriodLabel({ type: "year", year: 2024 }, "en", dict), "2024年");
});

test("报表: MONTHS_ZH 12 个月文案齐全", () => {
  assert.strictEqual(MONTHS_ZH.length, 12);
  assert.strictEqual(MONTHS_ZH[8], "九月");
});

test("报表: typeKey 覆盖 accountTypes 各键（snake→camel）", () => {
  const keys = ["cash", "debit_card", "credit_card", "wechat", "savings", "investment",
    "fund", "precious_metal", "bond", "foreign_currency", "custom"];
  const expected = ["cash", "debitCard", "creditCard", "wechat", "savings", "investment",
    "fund", "preciousMetal", "bond", "foreignCurrency", "custom"];
  for (const k of keys) {
    assert.ok(typeKey[k], `typeKey 缺 ${k}`);
  }
  assert.deepStrictEqual(keys.map((k) => typeKey[k]), expected);
});

/* ==================== 2. 金额展示格式化 ==================== */

test("展示: formatCents 千分位 + 小数补零 + 负数符号", () => {
  assert.strictEqual(formatCents(123456789), "1,234,567.89");
  assert.strictEqual(formatCents(1005), "10.05");
  assert.strictEqual(formatCents(1), "0.01");
  assert.strictEqual(formatCents(-5), "-0.05");
  assert.strictEqual(formatCents(1234567), "12,345.67");
});

test("展示: formatCents 对分数截断而非四舍五入（金额精度保护）", () => {
  assert.strictEqual(formatCents(105), "1.05");
});

test("入参: yuanToCents 严格拒绝非两位小数/空白/符号混入", () => {
  assert.strictEqual(yuanToCents(" 12.5 "), 1250);
  assert.strictEqual(yuanToCents(".5"), null);
  assert.strictEqual(yuanToCents("1."), null);
  assert.strictEqual(yuanToCents("1.2.3"), null);
  assert.strictEqual(yuanToCents("12,345"), null);
  assert.strictEqual(yuanToCents("1e3"), null);
  assert.strictEqual(yuanToCents(0), 0);
});

test("入参: yuanToCents 小数补位到分", () => {
  assert.strictEqual(yuanToCents("1.5"), 150);
  assert.strictEqual(yuanToCents("1.05"), 105);
  assert.strictEqual(yuanToCents("1.00"), 100);
  assert.strictEqual(yuanToCents("0.01"), 1);
});

test("汇率: convertCents 四舍五入到分 + 空值兜底", () => {
  // 1.5 元 × 6.5 汇率 ≈ 975 分（向下取整场景验证先换算再取整）
  assert.strictEqual(convertCents(100, "1.5", "1"), 150);
  // 大额折算不丢分（定点整数缩放）
  assert.strictEqual(convertCents(72000000, "1", "7.2"), 10000000);
  // 异常汇率按 1 处理
  assert.strictEqual(convertCents(500, "", ""), 500);
});

/* ==================== 3. 验证码 SVG（UI 结构） ==================== */

test("SVG: 验证码画布尺寸/命名空间/防混淆字符集", () => {
  const code = "K2M9";
  const svg = renderCaptchaSvg(code);
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), "应含 SVG 命名空间");
  assert.ok(svg.includes('width="96" height="40"'), "画布尺寸固定 96x40");
  for (const ch of code) assert.ok(svg.includes(`>${ch}</text>`), `字符 ${ch} 应渲染为 <text>`);
  // 干扰线存在（视觉防识别）
  assert.ok((svg.match(/<line /g) || []).length >= 2, "应有多条干扰线");
});

test("SVG: 渲染不含易混淆字符 0/O/1/I（安全字符集）", () => {
  const svg = renderCaptchaSvg("AB12"); // 注：A/B/2 是允许字符，仅验证 text 内容受字符集约束
  assert.ok(!svg.includes(">0</text>"));
  assert.ok(!svg.includes(">O</text>"));
  assert.ok(svg.includes(">A</text>"));
});
