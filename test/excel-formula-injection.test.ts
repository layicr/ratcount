/**
 * ratcount · 导出 Excel 公式注入防护（M1 回归测试）
 * 用户可控字符串（账户/分类/标签/项目名称、图标、备注、标签拼接）若以 = + - @ 等开头，
 * 会被 Excel / WPS / Google Sheets 当作公式执行。导出时前缀单引号强制按文本存储。
 * 运行：npx tsx --test test/excel-formula-injection.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asTextCell } from "../lib/io/excel";

test("危险首字符被转义为文本（加前缀单引号）", () => {
  assert.equal(asTextCell("=HYPERLINK(\"http://evil\")&A1"), "'=HYPERLINK(\"http://evil\")&A1");
  assert.equal(asTextCell("+1"), "'+1");
  assert.equal(asTextCell("-1"), "'-1");
  assert.equal(asTextCell("@SUM(A1:A9)"), "'@SUM(A1:A9)");
  assert.equal(asTextCell("\t=x"), "'\t=x");
  assert.equal(asTextCell("\r=x"), "'\r=x");
});

test("正常内容不被污染", () => {
  assert.equal(asTextCell("完成记账"), "完成记账");
  assert.equal(asTextCell("123"), "123");
  assert.equal(asTextCell("余额-100"), "余额-100"); // 危险字符不在首部
  assert.equal(asTextCell(""), "");
  assert.equal(asTextCell(" =foo"), " =foo"); // 首字符为空白，不触发
});

test("标签拼接结果整体转义", () => {
  const joined = ["=恶意", "正常"].map((x) => x).join("、");
  assert.equal(asTextCell(joined), "'=恶意、正常");
});
