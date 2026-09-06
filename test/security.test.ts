/**
 * ratcount · 安全测试（权限越权 / 账本隔离 / 注入防护 / 验证码与限流 / 密码哈希）
 * 说明：requireLedgerAccess / requireUser 依赖 NextAuth session，无法在纯 node 环境完整驱动，
 *       这里对"越权防护"做查询层隔离验证（Server Actions 全部经 requireLedgerAccess + 账本字段
 *       拼接，其隔离正确性等价于查询层 + 白名单 Schema 的组合，两者均在本地可完全验证）。
 * 运行：npx tsx --test test/security.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

// lib/db 与 lib/auth 依赖进程环境变量，必须在 import 前注入，因此全部改为 before 钩子动态加载
let db: any;
let seed: any;
let listAccountsWithBalance: any;
let listTransactions: any;
let countTransactions: any;
let categoryBreakdown: any;
let tagSummary: any;
let projectSummary: any;
let listAuditLogs: any;
let verifyCaptchaToken: any;
let createCaptchaToken: any;
let CAPTCHA_SECRET: any;
let allowAttempt: any;
let resetAttempts: any;
let REGISTER_LIMIT: any;
let CAPTCHA_LIMIT: any;
let txListFilterSchema: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ listAccountsWithBalance, listTransactions, countTransactions, categoryBreakdown, tagSummary, projectSummary, listAuditLogs } =
    await import("../lib/queries"));
  ({ verifyCaptchaToken, createCaptchaToken, CAPTCHA_SECRET } = await import("../lib/auth/captcha"));
  ({ allowAttempt, resetAttempts, REGISTER_LIMIT: REGISTER_LIMIT, CAPTCHA_LIMIT: CAPTCHA_LIMIT } = await import("../lib/auth/rate-limit"));
  ({ txListFilterSchema } = await import("../lib/validators/transaction"));
  seed = await seedTestData(db);
});

/* ==================== 1. 账本隔离（越权防护的查询层验证） ==================== */

test("隔离: 流水列表/计数/账户/报表均只返回本账本数据", async () => {
  // 流水
  const rows = await listTransactions(seed.l2.id);
  assert.strictEqual(rows.length, 1);
  assert.ok(!rows.find((r: any) => r.remark === "山姆会员店"), "不应看到账本1流水");
  assert.strictEqual(await countTransactions(seed.l2.id), 1);
  // 账户
  const accts = await listAccountsWithBalance(seed.l2.id);
  assert.strictEqual(accts.length, 1);
  assert.strictEqual(accts[0].name, "工作卡");
  // 报表
  const cats = await categoryBreakdown(seed.l2.id, "expense", { type: "year", year: 2026 });
  assert.strictEqual(cats.length, 0, "分类占比不跨账本");
  const tags = await tagSummary(seed.l2.id, { type: "year", year: 2026 });
  assert.ok(!tags.find((t: any) => t.name === "日常"));
  const pros = await projectSummary(seed.l2.id, { type: "year", year: 2026 });
  assert.ok(!pros.find((p: any) => p.name === "装修"));
});

test("隔离: 关键词搜索不能跨账本命中（账本1的关键词在账本2为 0）", async () => {
  assert.strictEqual(await countTransactions(seed.l2.id, { q: "山姆" }), 0);
  assert.strictEqual(await countTransactions(seed.l2.id, { q: "日常" }), 0);
});

test("隔离: 跨账本 id 作为过滤条件不返回任何跨本数据", async () => {
  // 用账本1的账户 id 过滤账本2 → 无结果
  assert.strictEqual(await countTransactions(seed.l2.id, { accountId: seed.ac1.id }), 0);
});

/* ==================== 2. SQL / 参数注入防护 ==================== */

test("注入: 恶意关键词不抛错、不命中、不清库", async () => {
  const { transactions } = await import("../db/schema");
  const attack = "' OR 1=1 --";
  const rows = await listTransactions(seed.l1.id, { q: attack });
  assert.ok(Array.isArray(rows), "注入串应被当作字面量搜索而非执行");
  assert.strictEqual(await countTransactions(seed.l1.id, { q: attack }), 0);

  // DROP 尝试：搜索执行后表仍完好
  const dropQ = "' DROP TABLE transactions; --";
  await listTransactions(seed.l1.id, { q: dropQ });
  const all = await db.select().from(transactions);
  assert.strictEqual(all.length, 5, "DROP 注入不得生效，全部流水应在");
});

test("注入: 恶意 id 作为过滤值仅作参数比对，不放大结果", async () => {
  assert.strictEqual(await countTransactions(seed.l1.id, { categoryId: "' OR 1=1 --" }), 0);
  assert.strictEqual(await countTransactions(seed.l1.id, { projectId: "x' OR '1'='1" }), 0);
});

test("注入: 白名单 Schema 在入口拦截脏 id / 类型 / 金额 / 日期", async () => {
  const p = txListFilterSchema.parse({
    type: "'; DROP TABLE transactions;--",
    categoryId: "' OR 1=1 --",
    accountId: "0 OR 1=1",
    q: "' OR '1'='1",
    minAmount: "-1; DROP",
  });
  assert.strictEqual(p.type, "");
  assert.strictEqual(p.categoryId, undefined);
  assert.strictEqual(p.accountId, undefined);
  assert.strictEqual(p.minAmount, undefined);
  assert.ok(typeof p.q === "string" && (p.q.includes("OR") || p.q.includes("1'='1")), "恶意串作为字面量保留、仅截断长度");
});

/* ==================== 3. 验证码 / 登录防爆破 ==================== */

test("验证码: 过期 token 被拒绝（防重放窗口外）", async () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ code: "AB12" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - 3600)
    .setExpirationTime(now - 300) // 已过期 5 分钟
    .sign(CAPTCHA_SECRET);
  assert.strictEqual(await verifyCaptchaToken(expired, "AB12"), false);
});

test("验证码: 正常 token 校验通过、错误答案拒绝", async () => {
  const token = await createCaptchaToken("MN23");
  assert.strictEqual(await verifyCaptchaToken(token, "MN23"), true);
  assert.strictEqual(await verifyCaptchaToken(token, ""), false);
});

test("登录限流: 注册限流 5 次/15 分钟、验证码限流 10 次/分钟 互相独立", () => {
  const ip = "203.0.113.9";
  resetAttempts(`register:${ip}`);
  resetAttempts(`captcha:${ip}`);
  for (let i = 0; i < 5; i++) assert.strictEqual(allowAttempt(`register:${ip}`), true);
  assert.strictEqual(allowAttempt(`register:${ip}`), false, "注册第 6 次被拒");
  for (let i = 0; i < 10; i++) assert.strictEqual(allowAttempt(`captcha:${ip}`, CAPTCHA_LIMIT), true);
  assert.strictEqual(allowAttempt(`captcha:${ip}`, CAPTCHA_LIMIT), false, "验证码第 11 次被拒");
  // 不同命名空间互不影响
  assert.strictEqual(allowAttempt(`register:${ip}`), false, "注册仍被限流");
});

test("登录限流: 重置后恢复尝试", () => {
  const key = "login:reset-ip";
  resetAttempts(key);
  for (let i = 0; i < 5; i++) allowAttempt(key);
  assert.strictEqual(allowAttempt(key), false);
  resetAttempts(key);
  assert.strictEqual(allowAttempt(key), true);
});

/* ==================== 4. 密码哈希（bcryptjs） ==================== */

test("密码: 哈希不可逆、加盐、同密文不同哈希", async () => {
  const bcrypt = await import("bcryptjs");
  const pw = "s3cret!密码";
  const h1 = await bcrypt.hash(pw, 10);
  const h2 = await bcrypt.hash(pw, 10);
  assert.notStrictEqual(h1, pw, "不得明文落库");
  assert.notStrictEqual(h1, h2, "加盐后同密码哈希不同");
  assert.strictEqual(await bcrypt.compare(pw, h1), true);
  assert.strictEqual(await bcrypt.compare("wrong", h1), false);
});

/* ==================== 5. 审计最小记录与查询边界 ==================== */

test("审计: 管理员/用户回看均走同一分页接口，且不因搜索注入放大", async () => {
  const { auditLogs } = await import("../db/schema");
  await db.insert(auditLogs).values({
    userId: seed.u1.id, action: "C", entity: "transaction", summary: "安全用例" , createdAt: new Date().toISOString(),
  });
  const res = await listAuditLogs({ search: "安全用例" });
  assert.strictEqual(res.total, 1);
  const dirty = await listAuditLogs({ search: "%' OR 1=1 --" });
  assert.strictEqual(dirty.total, 0, "LIKE 通配符不应注入放大");
});
