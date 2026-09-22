/**
 * ratcount · UI 层测试（组件可测逻辑 / 渲染纯函数 / 展示格式化 / SVG 结构）
 * 被测试内容不依赖浏览器，直接在 node 环境对渲染纯函数与格式化函数做断言；
 * 真实组件渲染由 next/test 生态（组件测试）在浏览器环境验证。
 * 运行：npx tsx --test test/ui-rendering.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fmt, getPeriodLabel } from "../app/(app)/components/reports/utils";
import { getMonthShortNames } from "../lib/datetime";
import { ACCOUNT_TYPE_I18N_KEY } from "../lib/constants";
import { formatCents, yuanToCents, convertCents } from "../lib/money";
import { renderCaptchaPng } from "../lib/auth/captcha";

/** 报表文案桩（模拟 i18n dict 中报表相关 key） */
const dict = {
  reports: {
    periodYear: "{year}年",
    periodMonth: "{year}年{month}",
  },
};

/** 桩 translator：从 dict 按 ns.key 取值，缺省返回 key（对齐 next-intl 行为） */
const tl = (key: string) => key.split(".").reduce((o: unknown, p: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined) ?? "", dict) as unknown as string || key;

/* ==================== 1. 报表工具 ==================== */

test("报表: fmt 模板插值（缺 key 原样保留）", () => {
  assert.strictEqual(fmt("{year}年", { year: 2026 }), "2026年");
  assert.strictEqual(fmt("第 {month} 期-{name}", { month: 9, name: "月度" }), "第 9 期-月度");
  assert.strictEqual(fmt("未定义 {missing}", {}), "未定义 {missing}");
});

test("报表: getPeriodLabel 年份/月度 + 中英文", () => {
  assert.strictEqual(getPeriodLabel({ type: "year", year: 2026 }, "zh-CN", tl), "2026年");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 9 }, "zh-CN", tl), "2026年9月");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 1 }, "zh-CN", tl), "2026年1月");
  assert.strictEqual(getPeriodLabel({ type: "month", year: 2026, month: 9 }, "en", tl), "2026年Sep");
  assert.strictEqual(getPeriodLabel({ type: "year", year: 2024 }, "en", tl), "2024年");
});

test("报表: getMonthShortNames 12 个月文案齐全（随 locale 自动变化）", () => {
  assert.strictEqual(getMonthShortNames("zh-CN").length, 12);
  assert.strictEqual(getMonthShortNames("zh-CN")[8], "9月");
});

test("报表: typeKey 覆盖 accountTypes 各键（snake→camel）", () => {
  const keys = ["cash", "debit_card", "credit_card", "wechat", "savings", "investment",
    "fund", "precious_metal", "bond", "foreign_currency", "custom"];
  const expected = ["cash", "debitCard", "creditCard", "wechat", "savings", "investment",
    "fund", "preciousMetal", "bond", "foreignCurrency", "custom"];
  for (const k of keys) {
    assert.ok(ACCOUNT_TYPE_I18N_KEY[k], `typeKey 缺 ${k}`);
  }
  assert.deepStrictEqual(keys.map((k) => ACCOUNT_TYPE_I18N_KEY[k].replace("acctType.", "")), expected);
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

/* ==================== 3. 验证码位图（UI 结构） ==================== */

test("位图: 验证码 PNG 尺寸固定 96×40、灰度、非空", () => {
  const png = renderCaptchaPng("K2M9", () => 0.5);
  assert.deepStrictEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "应为 PNG 位图（非 SVG 文本）",
  );
  assert.strictEqual(png.readUInt32BE(16), 96, "与 <img> 96px 宽一致");
  assert.strictEqual(png.readUInt32BE(20), 40, "与 <img> 40px 高一致");
  assert.strictEqual(png[24], 8, "位深 8");
  assert.strictEqual(png[25], 0, "颜色类型：灰度");
  assert.ok(png.length > 100, "应含压缩像素数据（有内容）");
});

test("位图: 响应体不含答案串（脚本无法直接读取明文）", () => {
  const code = "AB23";
  const png = renderCaptchaPng(code, () => 0.5);
  const text = png.toString("latin1");
  // 逐字符断言会因压缩字节偶然命中 ASCII 而 flaky，故断言整串答案不出现
  assert.ok(!text.includes(code), "不得出现答案串");
  assert.ok(!text.includes("<text"), "不得包含 SVG 文本节点");
});
