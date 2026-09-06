/**
 * ratcount · 单元测试（分页纯函数 / 日期范围 / SQL IN 工具 / 枚举一致性 / 月度标识）
 * 运行：npx tsx --test test/unit-pagination.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";

// 用与生产 SQLite 查询分发器相同的方言把 SQL 编译成 {sql, params}
const dialect = new (SQLiteDialect as any)({ casing: undefined });
function toQuery(s: any) {
  return dialect.sqlToQuery(s) as { sql: string; params: any[] };
}

import {
  parsePage,
  resolvePageSize,
  computeOffset,
  computeTotalPages,
  buildPageWindow,
} from "../lib/pagination-util";
import { monthRange, inSql } from "../lib/sql-utils";
import { monthKey, ACCOUNT_TYPE_LABELS } from "../lib/queries";
import {
  userRoles,
  memberRoles,
  accountTypes,
  transactionTypes,
  auditActions,
  recurringFrequencies,
  transactions,
} from "../db/schema";

/* ==================== 1. 分页解析 ==================== */

test("分页: 缺失/非法页码回退 1", () => {
  assert.strictEqual(parsePage(undefined), 1);
  assert.strictEqual(parsePage(null), 1);
  assert.strictEqual(parsePage(""), 1);
  assert.strictEqual(parsePage("abc"), 1);
  assert.strictEqual(parsePage("0"), 1);
  assert.strictEqual(parsePage("-3"), 1);
});

test("分页: 合法页码透传", () => {
  assert.strictEqual(parsePage("1"), 1);
  assert.strictEqual(parsePage("5"), 5);
  assert.strictEqual(parsePage("99"), 99);
});

test("分页: 每页条数仅在允许集合内生效，否则回退默认", () => {
  assert.strictEqual(resolvePageSize(undefined, [10, 20, 50], 10), 10);
  assert.strictEqual(resolvePageSize("20", [10, 20, 50], 10), 20);
  assert.strictEqual(resolvePageSize("7", [10, 20, 50], 10), 10);
  assert.strictEqual(resolvePageSize("huge", [10, 20, 50], 10), 10);
});

test("分页: offset 计算（首页为 0，不允许负偏移）", () => {
  assert.strictEqual(computeOffset(1, 20), 0);
  assert.strictEqual(computeOffset(2, 20), 20);
  assert.strictEqual(computeOffset(3, 50), 100);
  assert.strictEqual(computeOffset(0, 20), 0);
});

test("分页: 总页数至少 1，向上取整", () => {
  assert.strictEqual(computeTotalPages(0, 20), 1);
  assert.strictEqual(computeTotalPages(20, 20), 1);
  assert.strictEqual(computeTotalPages(21, 20), 2);
  assert.strictEqual(computeTotalPages(23, 10), 3);
});

test("分页: 页码窗口当前页居中、两端对齐、不足从 1 开始", () => {
  assert.deepStrictEqual(buildPageWindow(1, 10, 5), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(buildPageWindow(5, 10, 5), [3, 4, 5, 6, 7]);
  assert.deepStrictEqual(buildPageWindow(10, 10, 5), [6, 7, 8, 9, 10]);
  assert.deepStrictEqual(buildPageWindow(2, 2, 5), [1, 2]);
  assert.deepStrictEqual(buildPageWindow(3, 3, 3), [1, 2, 3]);
  // 当前页为末页时窗口回填到第一页起；页码超出总页时回落到 1 起
  assert.deepStrictEqual(buildPageWindow(5, 5, 5), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(buildPageWindow(9, 3, 5), [1, 2, 3]);
});

/* ==================== 2. 月度范围 ==================== */

test("日期: 平年/闰年 2 月 + 12 月末", () => {
  assert.deepStrictEqual(monthRange(2026, 2), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepStrictEqual(monthRange(2024, 2), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepStrictEqual(monthRange(2026, 12), { start: "2026-12-01", end: "2026-12-31" });
  assert.deepStrictEqual(monthRange(2026, 1), { start: "2026-01-01", end: "2026-01-31" });
});

test("日期: monthKey 输出本地 YYYY-MM", () => {
  const key = monthKey(new Date(2026, 8, 15)); // 9 月（0-based 8）
  assert.strictEqual(key, "2026-09");
  assert.match(key, /^\d{4}-\d{2}$/);
});

/* ==================== 3. SQL 工具（参数化 IN） ==================== */

test("SQL: inSql 空集合编译为 1=0 假条件", () => {
  const { sql: s, params } = toQuery(inSql(transactions.id, []));
  assert.strictEqual(s.toLowerCase(), "1=0");
  assert.strictEqual(params.length, 0);
});

test("SQL: inSql 生成参数化 IN（防注入，值不拼接进 SQL）", () => {
  const vals = ["aaa'", 'bbb" OR 1=1 --'];
  const { sql: s, params } = toQuery(inSql(transactions.id, vals));
  assert.ok(s.includes("IN (?, ?)"), `应含参数占位符，实际: ${s}`);
  // 危险值只存在参数里，不直接出现在 SQL 文本
  assert.ok(!s.includes("OR 1=1"), "危险值不应拼进 SQL");
  assert.deepStrictEqual(params, vals);
});

/* ==================== 4. 枚举与映射一致性 ==================== */

test("枚举: 各领域枚举非空且角色/类型/动作/频率取值正确", () => {
  assert.deepStrictEqual([...userRoles], ["admin", "user"]);
  assert.deepStrictEqual([...memberRoles], ["owner", "editor", "viewer"]);
  assert.deepStrictEqual([...transactionTypes], ["income", "expense", "transfer"]);
  assert.deepStrictEqual([...auditActions], ["C", "R", "U", "D"]);
  assert.deepStrictEqual([...recurringFrequencies], ["daily", "weekly", "monthly", "yearly"]);
  assert.strictEqual(accountTypes.length, 11);
});

test("枚举: ACCOUNT_TYPE_LABELS 覆盖全部账户类型（UI 永不丢文案）", () => {
  for (const t of accountTypes) {
    assert.ok(ACCOUNT_TYPE_LABELS[t] && ACCOUNT_TYPE_LABELS[t].trim().length > 0, `缺账户类型文案: ${t}`);
  }
  // 未知类型有安全兜底（UI 显示原文）
  assert.strictEqual(ACCOUNT_TYPE_LABELS["unknown_xyz"], undefined);
});

test("SQL: 独立 sql 模板参数化冒烟（与 buildTxConds 同类用法安全）", () => {
  const { sql: s, params } = toQuery(sql`${"午餐"} LIKE ${"%午餐%"}`);
  assert.strictEqual(s, "? LIKE ?");
  assert.deepStrictEqual(params, ["午餐", "%午餐%"]);
});
