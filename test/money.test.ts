/** 金额纯函数单测 / Money pure-function unit tests */
import { test } from "node:test";
import assert from "node:assert";
import { formatCents, yuanToCents, convertCents } from "../lib/money";

test("formatCents: 分 → 元字符串（千分位）", () => {
  assert.strictEqual(formatCents(123456), "1,234.56");
  assert.strictEqual(formatCents(-123456), "-1,234.56");
  assert.strictEqual(formatCents(100), "1.00");
  assert.strictEqual(formatCents(0), "0.00");
  assert.strictEqual(formatCents(-1), "-0.01");
});

test("yuanToCents: 元字符串 → 分", () => {
  assert.strictEqual(yuanToCents("1234.56"), 123456);
  assert.strictEqual(yuanToCents("1234"), 123400);
  assert.strictEqual(yuanToCents("1.5"), 150);
  assert.strictEqual(yuanToCents(2), 200);
  assert.strictEqual(yuanToCents("0.01"), 1);
});

test("yuanToCents: 非法输入返回 null", () => {
  assert.strictEqual(yuanToCents("abc"), null);
  assert.strictEqual(yuanToCents("1.234"), null);
  assert.strictEqual(yuanToCents("-5"), null);
  assert.strictEqual(yuanToCents(""), null);
});

test("convertCents: 汇率折算", () => {
  // 1 USD = 7.2 CNY：10000 美分 → 72000 人民币分
  assert.strictEqual(convertCents(10000, "7.2", "1"), 72000);
  // 10000 人民币分 → 美元（1 CNY = 1/7.2 USD）
  assert.strictEqual(convertCents(72000, "1", "7.2"), 10000);
});
