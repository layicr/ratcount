/**
 * ratcount · 注册默认账本名生成器单元测试（纯函数，无需 DB）
 * 运行：npx tsx --test test/ledger-name.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomLedgerName, LEDGER_NAME_WORDS } from "../lib/ledger-name";

test("zh-CN 默认账本名：意境词 + 账本-XXXX，且不超 30 字", () => {
  for (let i = 0; i < 50; i++) {
    const name = randomLedgerName("zh-CN");
    assert.match(name, /.+账本-\d{4}$/);
    assert.ok(name.length <= 30, `名称过长: ${name}`);
  }
});

test("zh-TW 默认账本名：意境词 + 帳本-XXXX", () => {
  for (let i = 0; i < 50; i++) {
    assert.match(randomLedgerName("zh-TW"), /.+帳本-\d{4}$/);
  }
});

test("en 默认账本名：词 + 空格 + Ledger-XXXX，且不超 30 字", () => {
  for (let i = 0; i < 50; i++) {
    const name = randomLedgerName("en");
    assert.match(name, /.+ Ledger-\d{4}$/);
    assert.ok(name.length <= 30, `名称过长: ${name}`);
  }
});

test("非法/缺失 locale 回退 zh-CN 格式", () => {
  assert.match(randomLedgerName("fr"), /.+账本-\d{4}$/);
  assert.match(randomLedgerName(""), /.+账本-\d{4}$/);
});

test("随机性：多次生成存在变化（非恒定）", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(randomLedgerName("zh-CN"));
  assert.ok(seen.size > 1, "生成的账本名应存在随机差异");
});

test("词表覆盖三种语言且非空", () => {
  for (const k of ["zh-CN", "zh-TW", "en"]) {
    assert.ok((LEDGER_NAME_WORDS[k]?.length ?? 0) > 0, `语言 ${k} 的词表不应为空`);
  }
});
