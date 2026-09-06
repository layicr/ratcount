/**
 * ratcount · 单元测试（共享校验 Schema：交易 / 筛选白名单 / 注册 / 登录）
 * 运行：npx tsx --test test/unit-validators.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  transactionSchema,
  txListFilterSchema,
  txTypeFilterSchema,
} from "../lib/validators/transaction";
import { registerSchema, loginSchema } from "../lib/validators/auth";

/* ==================== 1. 交易入参 Schema ==================== */

test("交易: 合法入参通过且字段透传", () => {
  const r = transactionSchema.safeParse({
    type: "expense",
    accountId: "acct-1",
    categoryId: "cat-1",
    amountYuan: "48.50",
    txDate: "2026-06-15",
    remark: "午餐",
    tagIds: ["t1"],
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data?.type, "expense");
});

test("交易: 非法 type 被拒绝", () => {
  const r = transactionSchema.safeParse({
    type: "expense2",
    accountId: "a",
    amountYuan: "1",
    txDate: "2026-06-15",
  });
  assert.strictEqual(r.success, false);
});

test("交易: 金额为空被拒绝", () => {
  const r = transactionSchema.safeParse({
    type: "expense",
    accountId: "a",
    amountYuan: "",
    txDate: "2026-06-15",
  });
  assert.strictEqual(r.success, false);
});

test("交易: 日期格式错误被拒绝", () => {
  const r = transactionSchema.safeParse({
    type: "income",
    accountId: "a",
    amountYuan: "100",
    txDate: "2026/06/15",
  });
  assert.strictEqual(r.success, false);
});

test("交易: 转账目标账户可空（业务层再校验）", () => {
  const r = transactionSchema.safeParse({
    type: "transfer",
    accountId: "a",
    amountYuan: "100",
    txDate: "2026-06-15",
  });
  assert.strictEqual(r.success, true);
});

test("交易: 备注超长被拒绝（max 200）", () => {
  const r = transactionSchema.safeParse({
    type: "expense",
    accountId: "a",
    amountYuan: "1",
    txDate: "2026-06-15",
    remark: "x".repeat(201),
  });
  assert.strictEqual(r.success, false);
});

/* ==================== 2. 流水列表筛选白名单（防脏值透传） ==================== */

test("筛选: 非法 type 回退为空串（不过滤）", () => {
  assert.strictEqual(txTypeFilterSchema.parse("hack"), "");
  assert.strictEqual(txTypeFilterSchema.parse(""), "");
  assert.strictEqual(txTypeFilterSchema.parse(undefined), "");
  assert.strictEqual(txTypeFilterSchema.parse("expense"), "expense");
});

test("筛选: 非法 UUID 的 id 一律回退 undefined", () => {
  const r = txListFilterSchema.parse({
    type: "income",
    categoryId: "not-a-uuid",
    accountId: "' OR 1=1 --",
    projectId: "123",
    q: "hello",
  });
  assert.strictEqual(r.categoryId, undefined);
  assert.strictEqual(r.accountId, undefined);
  assert.strictEqual(r.projectId, undefined);
  assert.strictEqual(r.q, "hello");
});

test("筛选: 合法 UUID 透传", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const r = txListFilterSchema.parse({ categoryId: uuid });
  assert.strictEqual(r.categoryId, uuid);
});

test("筛选: q 超长截断到 200 字符", () => {
  const r = txListFilterSchema.parse({ q: "x".repeat(500) });
  assert.strictEqual(typeof r.q, "string");
  assert.strictEqual((r.q ?? "").length, 200);
});

test("筛选: 非法金额（含空格/负数/三位小数）回退 undefined", () => {
  const r = txListFilterSchema.parse({
    minAmount: " 12.5", // 含空格非法
    maxAmount: "1.234", // 三位小数非法
  });
  assert.strictEqual(r.minAmount, undefined);
  assert.strictEqual(r.maxAmount, undefined);
});

test("筛选: 合法金额透传", () => {
  const r = txListFilterSchema.parse({ minAmount: "0.01", maxAmount: "9999.99" });
  assert.strictEqual(r.minAmount, "0.01");
  assert.strictEqual(r.maxAmount, "9999.99");
});

test("筛选: 非 YYYY-MM-DD 形态的日期回退 undefined（格式白名单，日历合法性由查询层字符串比较决定）", () => {
  const r = txListFilterSchema.parse({ startDate: "2026/01/01", endDate: "hello" });
  assert.strictEqual(r.startDate, undefined);
  assert.strictEqual(r.endDate, undefined);
  // 格式合法（即使日历上不存在）也应透传，因为筛选是字符串区间比较
  const ok = txListFilterSchema.parse({ startDate: "2026-13-99" });
  assert.strictEqual(ok.startDate, "2026-13-99");
});

/* ==================== 3. 注册 / 登录 Schema ==================== */

test("注册: 合法入参通过", () => {
  const r = registerSchema.safeParse({
    name: "张三", email: "demo@example.com", password: "secret123", captcha: "AB12",
  });
  assert.strictEqual(r.success, true);
});

test("注册: 邮箱格式非法被拒绝", () => {
  const r = registerSchema.safeParse({ name: "张三", email: "not-an-email", password: "secret123" });
  assert.strictEqual(r.success, false);
});

test("注册: 密码长度边界（6 通过 / 5 拒绝 / 72 通过 / 73 拒绝）", () => {
  assert.strictEqual(registerSchema.safeParse({ name: "a", email: "a@b.com", password: "123456" }).success, true);
  assert.strictEqual(registerSchema.safeParse({ name: "a", email: "a@b.com", password: "12345" }).success, false);
  assert.strictEqual(registerSchema.safeParse({ name: "a", email: "a@b.com", password: "x".repeat(72) }).success, true);
  assert.strictEqual(registerSchema.safeParse({ name: "a", email: "a@b.com", password: "x".repeat(73) }).success, false);
});

test("注册: 昵称长度边界（1-30）", () => {
  assert.strictEqual(registerSchema.safeParse({ name: "", email: "a@b.com", password: "123456" }).success, false);
  assert.strictEqual(registerSchema.safeParse({ name: "x".repeat(30), email: "a@b.com", password: "123456" }).success, true);
  assert.strictEqual(registerSchema.safeParse({ name: "x".repeat(31), email: "a@b.com", password: "123456" }).success, false);
});

test("登录: 邮箱/密码必填，密码至少 1 位", () => {
  assert.strictEqual(loginSchema.safeParse({ email: "a@b.com", password: "1" }).success, true);
  assert.strictEqual(loginSchema.safeParse({ email: "a@b.com", password: "" }).success, false);
  assert.strictEqual(loginSchema.safeParse({ email: "", password: "1" }).success, false);
  assert.strictEqual(loginSchema.safeParse({ email: "bad", password: "1" }).success, false);
});
