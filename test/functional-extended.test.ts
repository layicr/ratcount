/**
 * ratcount · 功能扩展测试（覆盖 functional-test-cases.md 中尚未自动化的 F1-F6 核心场景）
 *
 * 覆盖范围：
 *   F1 认证与注册：注册成功自动建账本并设 owner（含首用户 admin）、同邮箱重复注册被拒、
 *                  允许注册关闭时访问 /register 提示、普通用户注册自动建账本 owner
 *   F2 流水核心：新增支出/收入、转账（含目标账户校验）、行内复制、单笔删除、批量删除、
 *                筛选组合（类型+账户+关键词+日期+金额区间）
 *   F3 账户：新增（期初/类型/不计资产）、编辑、删除（引用保护）
 *   F4 分类 / 标签 / 项目：增改查删，删除时级联置空引用、保留历史流水
 *   F5 余额快照：记录快照后 diff 重算、对平（diff=0）、参数校验
 *   F6 报表聚合：仪表盘收支联动、净资产=计资产账户之和、分类占比/项目/标签/年度月度聚合
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/functional-extended.test.ts
 *
 * 测试环境适配（与 security-extended.test.ts 同源）：
 *   - require.extensions 钩子：打平 react.cache、替换根 auth.ts（可变 currentUser）、
 *     patch next/headers 与 next/cache（CJS 入口，node_modules 内可拦截）
 *   - Module._load 拦截 "next-intl/server" → test/helpers/next-intl-server-stub.cjs
 *     （next-intl@4 的 ./server 无 CJS 入口，纯 Node 环境 getTranslations 必抛错，
 *      故重定向到测试桩，getTranslations 返回 (key) => key）
 *   - 本文件末尾注册 after() 恢复全局 Module._load / Module._extensions，
 *     避免同进程串行运行其它测试文件时被拦截破坏（如 import-export-e2e 的错误消息断言）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray, desc } from "drizzle-orm";

/* ==================== 模块拦截（必须在业务模块加载前注册） ==================== */
const Module = require("node:module") as any;
const origJs = Module._extensions[".js"];
const origTs = Module._extensions[".ts"];

let reactCachePatched = false;

Module._extensions[".js"] = function (module: any, filename: string) {
  // react.cache → 恒等函数（打平 React 缓存，保证单测可见最新状态）
  if (!reactCachePatched && /[\\/]node_modules[\\/]react[\\/]index\.js$/.test(filename)) {
    reactCachePatched = true;
    origJs(module, filename);
    const origCache = module.exports.cache;
    if (origCache) {
      module.exports.cache = Object.assign((fn: any) => fn, { original: origCache });
    }
    return;
  }
  // next/headers：Node 无请求上下文，提供空 store / 空 Headers
  if (/[\\/]node_modules[\\/]next[\\/]headers\.js$/.test(filename)) {
    origJs(module, filename);
    module.exports.cookies = async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} });
    module.exports.headers = async () => new Headers();
    return;
  }
  // next/cache：revalidatePath/revalidateTag 在单测中无意义
  if (/[\\/]node_modules[\\/]next[\\/]cache\.js$/.test(filename)) {
    origJs(module, filename);
    module.exports.revalidatePath = () => {};
    module.exports.revalidateTag = () => {};
    module.exports.unstable_cache = (fn: any) => fn;
    return;
  }
  return origJs(module, filename);
};

Module._extensions[".ts"] = function (module: any, filename: string) {
  // 仅根目录 auth.ts → 可变身份（globalThis.__TEST_CURRENT_USER__），用于单文件切换当前用户。
  // 注意：lib/validators/auth.ts 等以 auth.ts 结尾的模块绝不能命中（否则 schema 被替换成身份桩）。
  const isRootAuthTs = /[\\/]auth\.ts$/.test(filename) && !/[\\/]node_modules/.test(filename) && !/[\\/](lib|app|db|test|helpers|components)[\\/]/.test(filename);
  if (isRootAuthTs) {
    const source = `
      export const auth = async () => {
        const u = globalThis.__TEST_CURRENT_USER__ ?? null;
        return u ? { user: { id: u.id, role: u.role } } : null;
      };
      export const handlers = {};
      export const signIn = async () => {};
      export const signOut = async () => {};
      export const authConfig = {};
    `;
    module._compile(source, filename);
    return;
  }
  return origTs(module, filename);
};

// next-intl/server：本测试覆盖链路中 copyTransaction 会调用 getTranslations 拼备注
// （t("tx.copied")），而 next-intl@4 的 ./server 无 CJS 入口、纯 Node 环境必抛错，
// 故通过 Module._load 重定向到本地测试桩；文件测试结束后由 after() 恢复原加载器。
const nextIntlStubPath = require.resolve("./helpers/next-intl-server-stub.cjs");
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "next-intl/server") return require(nextIntlStubPath);
  // next-intl 顶层包：lib/audit.ts 用 createTranslator 渲染 summaryKey 默认语言文本；
  // 纯 Node 环境下 use-intl 初始化缺少 Next 消息上下文，调用翻译器会返回 rejected
  // promise（INVALID_MESSAGE），形成 unhandled rejection 噪音。此处改为同步
  // (key) => key 翻译器，审计摘要按 key 落库、无副作用。
  if (request === "next-intl") return { createTranslator: () => (key: string) => key };
  return origLoad.apply(this, arguments);
};

function setUser(u: { id: string; role: string } | null) {
  (globalThis as any).__TEST_CURRENT_USER__ = u;
}

/* ==================== 动态加载（DB 模块依赖进程环境变量，须在 before 中 import） ==================== */
let db: any;
let seed: any;
let usersT: any, ledgersT: any, ledgerMembersT: any, settingsT: any, transactionsT: any,
  transactionTagsT: any, accountsT: any, categoriesT: any, tagsT: any, projectsT: any,
  balancesT: any, userMenuConfigT: any;

let registerAction: any;
let createTransaction: any, copyTransaction: any, deleteTransaction: any, batchDeleteTransactions: any;
let createAccount: any, updateAccount: any, deleteAccount: any;
let createCategory: any, updateCategory: any, deleteCategory: any;
let createTag: any, updateTag: any, deleteTag: any;
let createProject: any, updateProject: any, deleteProject: any;
let recordBalance: any;
let listAccountsWithBalance: any, countTransactions: any, dashboardStats: any,
  categoryBreakdown: any, projectSummary: any, tagSummary: any, yearSummary: any, listBalances: any;

const YEAR2026 = { type: "year", year: 2026 } as const;
const UUID = () => crypto.randomUUID();

before(async () => {
  const { setupTestDb, seedTestData } = await import("./helpers/db-fixture");
  const ctx = await setupTestDb();
  db = ctx.db;

  ({ listAccountsWithBalance, countTransactions, dashboardStats, categoryBreakdown, projectSummary, tagSummary, yearSummary, listBalances } =
    await import("../lib/queries"));
  ({ registerAction } = await import("../app/register/actions"));
  ({ createTransaction, copyTransaction, deleteTransaction, batchDeleteTransactions } = await import("../app/actions/transactions"));
  ({ createAccount, updateAccount, deleteAccount } = await import("../app/actions/accounts"));
  ({ createCategory, updateCategory, deleteCategory } = await import("../app/actions/categories"));
  ({ createTag, updateTag, deleteTag } = await import("../app/actions/common"));
  ({ createProject, updateProject, deleteProject } = await import("../app/actions/common"));
  ({ recordBalance } = await import("../app/actions/balances"));
  ({ users: usersT, ledgers: ledgersT, ledgerMembers: ledgerMembersT, settings: settingsT,
     transactions: transactionsT, transactionTags: transactionTagsT, accounts: accountsT,
     categories: categoriesT, tags: tagsT, projects: projectsT, balances: balancesT,
     userMenuConfig: userMenuConfigT } = await import("../db/schema"));

  setUser(null);
});

/* ==================== F1 认证与注册（空库执行，F1-06 后再播种供 F2-F6 使用） ==================== */
const REG_EMAIL_FIRST = "newfirst@test.dev";
const REG_EMAIL_SECOND = "newsecond@test.dev";

function regForm(overrides?: { email?: string; name?: string; password?: string }) {
  const fd = new FormData();
  fd.set("name", overrides?.name ?? "新用户");
  fd.set("email", overrides?.email ?? REG_EMAIL_FIRST);
  fd.set("password", overrides?.password ?? "secret123");
  return fd;
}

/**
 * 注册开关（安全默认值已改为关闭）：测试中显式开关，模拟管理员在设置页的操作
 * settings 表对 (userId, key) 唯一，故用 upsert 语义
 */
async function setRegistration(on: boolean) {
  const value = on ? "true" : "false";
  const [row] = await db
    .select()
    .from(settingsT)
    .where(and(eq(settingsT.userId, "global"), eq(settingsT.key, "allow_registration")))
    .limit(1);
  if (row) {
    await db.update(settingsT).set({ value, updatedAt: new Date().toISOString() }).where(eq(settingsT.id, row.id));
  } else {
    await db.insert(settingsT).values({
      id: UUID(),
      userId: "global",
      key: "allow_registration",
      value,
      updatedAt: new Date().toISOString(),
    });
  }
}

test("F1-01 注册成功：自动创建默认账本并设 owner（菜单配置为空=默认全开）", async () => {
  setUser(null);
  await setRegistration(true); // 注册默认关闭，需管理员显式开启
  await assert.rejects(
    () => registerAction(null, regForm({ email: REG_EMAIL_FIRST })),
    /NEXT_REDIRECT/,
    "注册成功应重定向到登录页（抛 NEXT_REDIRECT）",
  );
  const [u] = await db.select().from(usersT).where(eq(usersT.email, REG_EMAIL_FIRST)).limit(1);
  assert.ok(u, "注册用户应落库");
  assert.strictEqual(u.name, "新用户");
  const [ledger] = await db.select().from(ledgersT).where(eq(ledgersT.createdBy, u.id)).limit(1);
  assert.ok(ledger, "注册成功应自动创建默认账本");
  const [member] = await db
    .select()
    .from(ledgerMembersT)
    .where(and(eq(ledgerMembersT.ledgerId, ledger.id), eq(ledgerMembersT.userId, u.id)))
    .limit(1);
  assert.ok(member, "应自动加入账本成员表");
  assert.strictEqual(member.role, "owner");
  const menus = await db.select().from(userMenuConfigT).where(eq(userMenuConfigT.userId, u.id));
  assert.strictEqual(menus.length, 0, "未配置菜单时按默认全部启用");
});

test("F1-02 同邮箱重复注册被拒", async () => {
  setUser(null);
  const res = await registerAction(null, regForm({ email: REG_EMAIL_FIRST }));
  assert.deepStrictEqual(res, { ok: false, error: "register.emailTaken" });
  // 数据库不产生第二行
  const rows = await db.select().from(usersT).where(eq(usersT.email, REG_EMAIL_FIRST));
  assert.strictEqual(rows.length, 1);
});

test("F1-03 允许注册关闭时访问 /register 提示未开放", async () => {
  setUser(null);
  await setRegistration(false);
  try {
    const res = await registerAction(null, regForm({ email: REG_EMAIL_SECOND }));
    assert.deepStrictEqual(res, { ok: false, error: "register.closed" });
    const rows = await db.select().from(usersT).where(eq(usersT.email, REG_EMAIL_SECOND));
    assert.strictEqual(rows.length, 0, "关闭注册时不应创建用户");
  } finally {
    await setRegistration(true); // 恢复开启，供 F1-05 使用
  }
});

test("F1-04 首用户注册自动成为管理员", async () => {
  const [u] = await db.select().from(usersT).where(eq(usersT.email, REG_EMAIL_FIRST)).limit(1);
  assert.ok(u, "首用户应存在（由 F1-01 注册）");
  assert.strictEqual(u.role, "admin", "首个注册用户应自动成为 admin");
});

test("F1-05 非首用户注册：role=user 且同样自动建账本并设 owner", async () => {
  setUser(null);
  await assert.rejects(
    () => registerAction(null, regForm({ email: REG_EMAIL_SECOND })),
    /NEXT_REDIRECT/,
  );
  const [u] = await db.select().from(usersT).where(eq(usersT.email, REG_EMAIL_SECOND)).limit(1);
  assert.ok(u);
  assert.strictEqual(u.role, "user", "非首用户应为普通用户");
  const [ledger] = await db.select().from(ledgersT).where(eq(ledgersT.createdBy, u.id)).limit(1);
  assert.ok(ledger, "普通用户注册也应自动建账本");
  const [member] = await db
    .select()
    .from(ledgerMembersT)
    .where(and(eq(ledgerMembersT.ledgerId, ledger.id), eq(ledgerMembersT.userId, u.id)))
    .limit(1);
  assert.strictEqual(member.role, "owner");
});

test("F1-06 前置：播种种子数据（供 F2-F6 使用）", async () => {
  const { seedTestData } = await import("./helpers/db-fixture");
  seed = await seedTestData(db);
  assert.ok(seed.l1 && seed.ac1 && seed.t1, "种子数据就绪");
});

/* ==================== F2 流水核心（currentUser = u1，账本 l1） ==================== */
function asU1() {
  setUser({ id: seed.u1.id, role: seed.u1.role });
}

async function txByRemark(remark: string) {
  const [row] = await db.select().from(transactionsT).where(eq(transactionsT.remark, remark)).limit(1);
  return row;
}

async function acctBalance(accountId: string) {
  const rows = await listAccountsWithBalance(seed.l1.id);
  return rows.find((a: any) => a.id === accountId).balanceCents;
}

test("F2-01 新增支出：落库、账户余额减少、仪表盘月支出联动", async () => {
  asU1();
  const beforeBalance = await acctBalance(seed.ac1.id);
  const beforeStats = await dashboardStats(seed.l1.id, YEAR2026);
  const res = await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "66.66", txDate: "2026-06-20", remark: "功能扩展-支出",
  });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const tx = await txByRemark("功能扩展-支出");
  assert.ok(tx, "支出流水应落库");
  assert.strictEqual(tx.amountCents, 6666);
  assert.strictEqual(tx.categoryId, seed.catFood.id);
  assert.strictEqual(tx.type, "expense");
  assert.strictEqual(await acctBalance(seed.ac1.id), beforeBalance - 6666);
  const stats = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(stats.monthExpense, beforeStats.monthExpense + 6666);
  assert.strictEqual(stats.expenseCount, beforeStats.expenseCount + 1);
});

test("F2-02 新增收入：落库、账户余额增加、仪表盘月收入联动", async () => {
  asU1();
  const beforeBalance = await acctBalance(seed.ac2.id);
  const beforeStats = await dashboardStats(seed.l1.id, YEAR2026);
  const res = await createTransaction({
    type: "income", accountId: seed.ac2.id, categoryId: seed.catSalary.id,
    amountYuan: "1000", txDate: "2026-06-21", remark: "功能扩展-收入",
  });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const tx = await txByRemark("功能扩展-收入");
  assert.ok(tx);
  assert.strictEqual(tx.amountCents, 100000);
  assert.strictEqual(await acctBalance(seed.ac2.id), beforeBalance + 100000);
  const stats = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(stats.monthIncome, beforeStats.monthIncome + 100000);
  assert.strictEqual(stats.incomeCount, beforeStats.incomeCount + 1);
});

test("F2-03 转账：一出一进、余额守恒、不计收支", async () => {
  asU1();
  const beforeStats = await dashboardStats(seed.l1.id, YEAR2026);
  const beforeA1 = await acctBalance(seed.ac1.id);
  const beforeA2 = await acctBalance(seed.ac2.id);
  const res = await createTransaction({
    type: "transfer", accountId: seed.ac1.id, toAccountId: seed.ac2.id,
    amountYuan: "50", txDate: "2026-06-22", remark: "功能扩展-转账",
  });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const tx = await txByRemark("功能扩展-转账");
  assert.strictEqual(tx.type, "transfer");
  assert.strictEqual(tx.toAccountId, seed.ac2.id);
  assert.strictEqual(await acctBalance(seed.ac1.id), beforeA1 - 5000);
  assert.strictEqual(await acctBalance(seed.ac2.id), beforeA2 + 5000);
  const stats = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(stats.monthIncome, beforeStats.monthIncome, "转账不计收入");
  assert.strictEqual(stats.monthExpense, beforeStats.monthExpense, "转账不计支出");
});

test("F2-04 转账校验：缺目标账户 / 目标等于来源均被拒", async () => {
  asU1();
  const r1 = await createTransaction({
    type: "transfer", accountId: seed.ac1.id, amountYuan: "10", txDate: "2026-06-22",
  });
  assert.deepStrictEqual(r1, { ok: false, error: "errors.selectTransfer" });
  const r2 = await createTransaction({
    type: "transfer", accountId: seed.ac1.id, toAccountId: seed.ac1.id,
    amountYuan: "10", txDate: "2026-06-22",
  });
  assert.deepStrictEqual(r2, { ok: false, error: "errors.selectTransfer" });
});

test("F2-05 收支必填分类：缺分类被拒", async () => {
  asU1();
  const r1 = await createTransaction({
    type: "expense", accountId: seed.ac1.id, amountYuan: "10", txDate: "2026-06-22",
  });
  assert.deepStrictEqual(r1, { ok: false, error: "common.categoryRequired" });
  const r2 = await createTransaction({
    type: "income", accountId: seed.ac2.id, amountYuan: "10", txDate: "2026-06-22",
  });
  assert.deepStrictEqual(r2, { ok: false, error: "common.categoryRequired" });
});

test("F2-06 金额校验：非数字 / 零 / 负数均被拒", async () => {
  asU1();
  for (const bad of ["abc", "0", "-5"]) {
    const r = await createTransaction({
      type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
      amountYuan: bad, txDate: "2026-06-22",
    });
    assert.deepStrictEqual(r, { ok: false, error: "errors.amountInvalid" }, `金额 ${bad} 应被拒`);
  }
});

test("F2-07 流水关联项目：落库并计入项目聚合", async () => {
  asU1();
  const res = await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    projectId: seed.proj.id, amountYuan: "88.88", txDate: "2026-06-23", remark: "功能扩展-项目流水",
  });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const tx = await txByRemark("功能扩展-项目流水");
  assert.strictEqual(tx.projectId, seed.proj.id);
  const rows = await projectSummary(seed.l1.id, YEAR2026);
  const p = rows.find((r: any) => r.id === seed.proj.id);
  assert.ok(p);
  assert.strictEqual(p.expense, 4800 + 8888, "项目支出=种子 4800 + 新增 8888");
});

test("F2-08 流水关联标签：关联落库并计入标签聚合", async () => {
  asU1();
  const res = await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    tagIds: [seed.tagDaily.id], amountYuan: "77.77", txDate: "2026-06-24", remark: "功能扩展-标签流水",
  });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const tx = await txByRemark("功能扩展-标签流水");
  const links = await db.select().from(transactionTagsT).where(eq(transactionTagsT.transactionId, tx.id));
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].tagId, seed.tagDaily.id);
  const rows = await tagSummary(seed.l1.id, YEAR2026);
  const t = rows.find((r: any) => r.id === seed.tagDaily.id);
  assert.strictEqual(t.expenseCents, 4800 + 7777, "标签支出=种子 4800 + 新增 7777");
});

test("F2-09 行内复制：生成今日新流水、金额一致、备注追加『复制』标识、标签复制", async () => {
  asU1();
  const res = await copyTransaction(seed.t1.id);
  assert.deepStrictEqual(res, { ok: true, error: null });
  const today = new Date().toISOString().slice(0, 10);
  // 测试桩 getTranslations 返回 key 本身："copied"
  const [copy] = await db
    .select()
    .from(transactionsT)
    .where(and(eq(transactionsT.remark, "山姆会员店copied"), eq(transactionsT.txDate, today)))
    .limit(1);
  assert.ok(copy, "应生成今日复制流水");
  assert.strictEqual(copy.amountCents, seed.t1.amountCents);
  assert.strictEqual(copy.type, seed.t1.type);
  const links = await db.select().from(transactionTagsT).where(eq(transactionTagsT.transactionId, copy.id));
  assert.strictEqual(links.length, 1, "复制流水应复制标签");
  assert.strictEqual(links[0].tagId, seed.tagDaily.id);
  // 复制不存在的流水 → txNotFound
  const r2 = await copyTransaction("no-such-tx");
  assert.deepStrictEqual(r2, { ok: false, error: "errors.txNotFound" });
});

test("F2-10 删除单笔：流水消失、账户余额回滚", async () => {
  asU1();
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "9.99", txDate: "2026-06-25", remark: "功能扩展-待删单笔",
  });
  const tx = await txByRemark("功能扩展-待删单笔");
  const before = await acctBalance(seed.ac1.id);
  const res = await deleteTransaction(tx.id);
  assert.deepStrictEqual(res, { ok: true, error: null });
  const rows = await db.select().from(transactionsT).where(eq(transactionsT.id, tx.id));
  assert.strictEqual(rows.length, 0, "流水应被删除");
  assert.strictEqual(await acctBalance(seed.ac1.id), before + 999, "余额应回滚");
  // 删除不存在的流水 → txNotFound
  const r2 = await deleteTransaction("no-such-tx");
  assert.deepStrictEqual(r2, { ok: false, error: "errors.txNotFound" });
});

test("F2-11 批量删除：空选拒绝、多选全删、跨账本流水受保护", async () => {
  asU1();
  const r0 = await batchDeleteTransactions([]);
  assert.deepStrictEqual(r0, { ok: false, error: "errors.noneSelected" });
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "1.11", txDate: "2026-06-25", remark: "功能扩展-批量删A",
  });
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "2.22", txDate: "2026-06-25", remark: "功能扩展-批量删B",
  });
  const [a, b] = await db
    .select()
    .from(transactionsT)
    .where(inArray(transactionsT.remark, ["功能扩展-批量删A", "功能扩展-批量删B"]));
  assert.ok(a && b, "两条待删流水应存在");
  // 取 l2 账本的一条流水 id 混入批量删除
  const [l2tx] = await db.select().from(transactionsT).where(eq(transactionsT.ledgerId, seed.l2.id)).limit(1);
  assert.ok(l2tx, "l2 应存在流水");
  const res = await batchDeleteTransactions([a.id, b.id, l2tx.id]);
  assert.deepStrictEqual(res, { ok: true, error: null });
  assert.strictEqual((await db.select().from(transactionsT).where(eq(transactionsT.id, a.id))).length, 0);
  assert.strictEqual((await db.select().from(transactionsT).where(eq(transactionsT.id, b.id))).length, 0);
  assert.strictEqual((await db.select().from(transactionsT).where(eq(transactionsT.id, l2tx.id))).length, 1, "跨账本流水不得被删");
});

test("F2-12 筛选组合：类型+账户+关键词+日期+金额区间组合命中", async () => {
  asU1();
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "10.00", txDate: "2026-07-01", remark: "筛选组合专属甲",
  });
  await createTransaction({
    type: "income", accountId: seed.ac2.id, categoryId: seed.catSalary.id,
    amountYuan: "200.00", txDate: "2026-07-02", remark: "筛选组合专属乙",
  });
  await createTransaction({
    type: "expense", accountId: seed.ac2.id, categoryId: seed.catFood.id,
    amountYuan: "30.00", txDate: "2026-07-03", remark: "筛选组合专属丙",
  });
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "筛选组合专属" }), 3, "关键词全命中");
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "筛选组合专属", type: "expense" }), 2, "关键词+类型");
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "筛选组合专属", accountId: seed.ac1.id }), 1, "关键词+账户");
  assert.strictEqual(
    await countTransactions(seed.l1.id, { q: "筛选组合专属", type: "expense", accountId: seed.ac2.id, startDate: "2026-07-01", endDate: "2026-07-03" }),
    1,
    "关键词+类型+账户+日期区间",
  );
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "筛选组合专属", minAmount: 10000, maxAmount: 50000 }), 1, "关键词+金额区间（乙 200.00）");
});

/* ==================== F3 账户（增删改查） ==================== */
test("F3-01 新增账户：期初余额落库、余额列表即时可见", async () => {
  asU1();
  const res = await createAccount({ name: "新账户A", type: "cash", currencyCode: "CNY", openingYuan: "1000" });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const [acct] = await db.select().from(accountsT).where(eq(accountsT.name, "新账户A")).limit(1);
  assert.ok(acct);
  assert.strictEqual(acct.openingBalanceCents, 100000);
  assert.strictEqual(acct.isAsset, true);
  const rows = await listAccountsWithBalance(seed.l1.id);
  assert.strictEqual(rows.find((a: any) => a.id === acct.id).balanceCents, 100000);
});

test("F3-02 新增账户：类型正确落库（credit_card）", async () => {
  asU1();
  const res = await createAccount({ name: "新账户B", type: "credit_card", currencyCode: "CNY" });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const [acct] = await db.select().from(accountsT).where(eq(accountsT.name, "新账户B")).limit(1);
  assert.strictEqual(acct.type, "credit_card");
});

test("F3-03 不计资产账户：isAsset=false 不计入净资产", async () => {
  asU1();
  const before = await dashboardStats(seed.l1.id, YEAR2026);
  const res = await createAccount({ name: "不计资产账户", type: "cash", currencyCode: "CNY", openingYuan: "5000", isAsset: false });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const [acct] = await db.select().from(accountsT).where(eq(accountsT.name, "不计资产账户")).limit(1);
  assert.strictEqual(acct.isAsset, false);
  const after = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(after.assets, before.assets, "isAsset=false 期初 5000 元不计入净资产");
});

test("F3-04 编辑账户：名称与期初余额更新、余额即时反映", async () => {
  asU1();
  const [a] = await db.select().from(accountsT).where(eq(accountsT.name, "新账户A")).limit(1);
  assert.ok(a);
  const res = await updateAccount(a.id, { name: "新账户A改", type: "cash", currencyCode: "CNY", openingYuan: "2000" });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const [a2] = await db.select().from(accountsT).where(eq(accountsT.id, a.id)).limit(1);
  assert.strictEqual(a2.name, "新账户A改");
  assert.strictEqual(a2.openingBalanceCents, 200000);
  const rows = await listAccountsWithBalance(seed.l1.id);
  assert.strictEqual(rows.find((r: any) => r.id === a.id).balanceCents, 200000);
});

test("F3-05 删除账户：无引用可删、被流水引用拒绝", async () => {
  asU1();
  const [b] = await db.select().from(accountsT).where(eq(accountsT.name, "新账户B")).limit(1);
  assert.deepStrictEqual(await deleteAccount(b.id), { ok: true, error: null });
  assert.strictEqual((await db.select().from(accountsT).where(eq(accountsT.id, b.id))).length, 0, "无引用账户应删除成功");
  const [a] = await db.select().from(accountsT).where(eq(accountsT.name, "新账户A改")).limit(1);
  assert.deepStrictEqual(await deleteAccount(a.id), { ok: true, error: null });
  assert.deepStrictEqual(await deleteAccount(seed.ac1.id), { ok: false, error: "errors.accountInUse" }, "被流水引用应拒绝删除");
});

/* ==================== F4 分类 / 标签 / 项目（增改删查 + 级联） ==================== */
test("F4-01 分类增改：新增、改名、空名拒绝", async () => {
  asU1();
  assert.deepStrictEqual(await createCategory({ name: "交通", type: "expense" }), { ok: true, error: null });
  const [c] = await db.select().from(categoriesT).where(eq(categoriesT.name, "交通")).limit(1);
  assert.ok(c);
  assert.strictEqual(c.type, "expense");
  assert.deepStrictEqual(await updateCategory(c.id, { name: "交通出行", type: "expense" }), { ok: true, error: null });
  const [c2] = await db.select().from(categoriesT).where(eq(categoriesT.id, c.id)).limit(1);
  assert.strictEqual(c2.name, "交通出行");
  assert.deepStrictEqual(await createCategory({ name: "   ", type: "expense" }), { ok: false, error: "errors.nameRequired" });
});

test("F4-02 删除分类：历史流水保留且 categoryId 置空", async () => {
  asU1();
  const [c] = await db.select().from(categoriesT).where(eq(categoriesT.name, "交通出行")).limit(1);
  assert.ok(c, "待删分类应存在");
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: c.id,
    amountYuan: "44.44", txDate: "2026-06-26", remark: "功能扩展-待删分类流水",
  });
  const tx = await txByRemark("功能扩展-待删分类流水");
  assert.deepStrictEqual(await deleteCategory(c.id), { ok: true, error: null });
  assert.strictEqual((await db.select().from(categoriesT).where(eq(categoriesT.id, c.id))).length, 0, "分类应删除");
  const [tx2] = await db.select().from(transactionsT).where(eq(transactionsT.id, tx.id)).limit(1);
  assert.ok(tx2, "历史流水应保留");
  assert.strictEqual(tx2.categoryId, null, "流水 categoryId 应置空");
});

test("F4-03 标签增改：新增、改名/改色、空名拒绝", async () => {
  asU1();
  assert.deepStrictEqual(await createTag({ name: "旅行", color: "#ff0000" }), { ok: true, error: null });
  const [t] = await db.select().from(tagsT).where(eq(tagsT.name, "旅行")).limit(1);
  assert.ok(t);
  assert.deepStrictEqual(await updateTag(t.id, { name: "旅行新", color: "#00ff00" }), { ok: true, error: null });
  const [t2] = await db.select().from(tagsT).where(eq(tagsT.id, t.id)).limit(1);
  assert.strictEqual(t2.name, "旅行新");
  assert.strictEqual(t2.color, "#00ff00");
  assert.deepStrictEqual(await createTag({ name: " " }), { ok: false, error: "errors.tagNameRequired" });
});

test("F4-04 删除标签：流水保留、流水-标签关联清理", async () => {
  asU1();
  const [t] = await db.select().from(tagsT).where(eq(tagsT.name, "旅行新")).limit(1);
  assert.ok(t, "待删标签应存在");
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    tagIds: [t.id], amountYuan: "5.55", txDate: "2026-06-26", remark: "功能扩展-待删标签流水",
  });
  const tx = await txByRemark("功能扩展-待删标签流水");
  assert.strictEqual((await db.select().from(transactionTagsT).where(eq(transactionTagsT.transactionId, tx.id))).length, 1, "删除前关联存在");
  assert.deepStrictEqual(await deleteTag(t.id), { ok: true, error: null });
  assert.strictEqual((await db.select().from(tagsT).where(eq(tagsT.id, t.id))).length, 0, "标签应删除");
  assert.strictEqual((await db.select().from(transactionTagsT).where(eq(transactionTagsT.tagId, t.id))).length, 0, "关联应清理");
  const [tx2] = await db.select().from(transactionsT).where(eq(transactionsT.id, tx.id)).limit(1);
  assert.ok(tx2, "流水应保留");
});

test("F4-05 项目增改：新增（预算/状态）、改预算", async () => {
  asU1();
  assert.deepStrictEqual(await createProject({ name: "健身", icon: "🏋️", budgetYuan: "10000" }), { ok: true, error: null });
  const [p] = await db.select().from(projectsT).where(eq(projectsT.name, "健身")).limit(1);
  assert.ok(p);
  assert.strictEqual(p.budgetCents, 1000000);
  assert.strictEqual(p.status, "active");
  assert.deepStrictEqual(await updateProject(p.id, { name: "健身新", budgetYuan: "20000" }), { ok: true, error: null });
  const [p2] = await db.select().from(projectsT).where(eq(projectsT.id, p.id)).limit(1);
  assert.strictEqual(p2.name, "健身新");
  assert.strictEqual(p2.budgetCents, 2000000);
});

test("F4-06 删除项目：历史流水保留且 projectId 置空", async () => {
  asU1();
  const [p] = await db.select().from(projectsT).where(eq(projectsT.name, "健身新")).limit(1);
  assert.ok(p, "待删项目应存在");
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    projectId: p.id, amountYuan: "6.66", txDate: "2026-06-26", remark: "功能扩展-待删项目流水",
  });
  const tx = await txByRemark("功能扩展-待删项目流水");
  assert.deepStrictEqual(await deleteProject(p.id), { ok: true, error: null });
  assert.strictEqual((await db.select().from(projectsT).where(eq(projectsT.id, p.id))).length, 0, "项目应删除");
  const [tx2] = await db.select().from(transactionsT).where(eq(transactionsT.id, tx.id)).limit(1);
  assert.ok(tx2, "流水应保留");
  assert.strictEqual(tx2.projectId, null, "流水 projectId 应置空");
});

/* ==================== F5 余额快照（对账） ==================== */
test("F5-01 余额表基线：快照金额 + 与实时余额的差异重算", async () => {
  asU1();
  const live = new Map((await listAccountsWithBalance(seed.l1.id)).map((a: any) => [a.id, a.balanceCents]));
  const rows = await listBalances(seed.l1.id);
  const ac1 = rows.find((r: any) => r.id === seed.ac1.id);
  assert.ok(ac1);
  assert.strictEqual(ac1.snapshot.balanceAmountCents, 8000, "种子快照 8000 分");
  assert.strictEqual(ac1.diff, (live.get(seed.ac1.id) as number) - 8000, "diff = 实时余额 - 快照");
  const ac2 = rows.find((r: any) => r.id === seed.ac2.id);
  assert.strictEqual(ac2.snapshot, null, "无快照账户 snapshot=null");
  assert.strictEqual(ac2.diff, null);
});

test("F5-02 记录快照：落库且 listBalances 差异即时重算", async () => {
  asU1();
  const live = (await listAccountsWithBalance(seed.l1.id)).find((a: any) => a.id === seed.ac1.id).balanceCents;
  const res = await recordBalance({ accountId: seed.ac1.id, balanceYuan: "-163.00", snapshotDate: "2026-09-10" });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const [snap] = await db
    .select()
    .from(balancesT)
    .where(eq(balancesT.accountId, seed.ac1.id))
    .orderBy(desc(balancesT.snapshotDate));
  assert.ok(snap, "应存在快照记录");
  assert.strictEqual(snap.balanceAmountCents, -16300, "支持负余额快照");
  assert.strictEqual(snap.snapshotDate, "2026-09-10");
  const rows = await listBalances(seed.l1.id);
  const ac1 = rows.find((r: any) => r.id === seed.ac1.id);
  assert.strictEqual(ac1.snapshot.balanceAmountCents, -16300, "最新快照应覆盖展示");
  assert.strictEqual(ac1.diff, live - -16300, "diff 应随新快照重算");
});

test("F5-03 对平：快照与实时余额一致时 diff=0", async () => {
  asU1();
  await createAccount({ name: "对平账户", type: "cash", currencyCode: "CNY", openingYuan: "888.88" });
  const [acct] = await db.select().from(accountsT).where(eq(accountsT.name, "对平账户")).limit(1);
  const res = await recordBalance({ accountId: acct.id, balanceYuan: "888.88", snapshotDate: "2026-09-11" });
  assert.deepStrictEqual(res, { ok: true, error: null });
  const rows = await listBalances(seed.l1.id);
  const row = rows.find((r: any) => r.id === acct.id);
  assert.ok(row, "对平账户应出现在余额表");
  assert.strictEqual(row.diff, 0, "实时余额=期初 888.88，与快照一致应标记对平");
});

test("F5-04 快照校验：日期格式非法、跨账本账户均被拒", async () => {
  asU1();
  const r1 = await recordBalance({ accountId: seed.ac1.id, balanceYuan: "100", snapshotDate: "2026/09/10" });
  assert.deepStrictEqual(r1, { ok: false, error: "errors.invalidInput" });
  const r2 = await recordBalance({ accountId: seed.ac3.id, balanceYuan: "100", snapshotDate: "2026-09-10" });
  assert.deepStrictEqual(r2, { ok: false, error: "errors.accountNotFound" }, "他账本账户不得记录快照");
});

/* ==================== F6 报表聚合 ==================== */
test("F6-01 仪表盘聚合：新增收支后月收支/笔数联动", async () => {
  asU1();
  const before = await dashboardStats(seed.l1.id, YEAR2026);
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "1.00", txDate: "2026-06-29", remark: "功能扩展-报表支出",
  });
  await createTransaction({
    type: "income", accountId: seed.ac2.id, categoryId: seed.catSalary.id,
    amountYuan: "2.00", txDate: "2026-06-29", remark: "功能扩展-报表收入",
  });
  const after = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(after.monthExpense, before.monthExpense + 100);
  assert.strictEqual(after.monthIncome, before.monthIncome + 200);
  assert.strictEqual(after.expenseCount, before.expenseCount + 1);
  assert.strictEqual(after.incomeCount, before.incomeCount + 1);
  assert.strictEqual(after.totalCount, before.totalCount + 2);
  assert.ok(Array.isArray(after.trend) && after.trend.length === 6, "趋势槽位存在");
  assert.ok(Array.isArray(after.distribution));
});

test("F6-02 净资产聚合：assets = 全部计资产账户余额之和", async () => {
  asU1();
  const accts = await listAccountsWithBalance(seed.l1.id);
  const sum = accts.filter((a: any) => a.isAsset).reduce((s: number, a: any) => s + a.balanceCents, 0);
  const stats = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(stats.assets, sum, "净资产应为计资产账户余额之和（不含 isAsset=false）");
  assert.strictEqual(stats.liabilities, 0);
  assert.strictEqual(stats.netWorth, sum);
});

test("F6-03 分类聚合：新增分类支出后对应分类 cents 联动", async () => {
  asU1();
  const before = ((await categoryBreakdown(seed.l1.id, "expense", YEAR2026)).find((r: any) => r.category?.id === seed.catFood.id)?.cents) ?? 0;
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "44.44", txDate: "2026-06-28", remark: "功能扩展-分类聚合",
  });
  const after = ((await categoryBreakdown(seed.l1.id, "expense", YEAR2026)).find((r: any) => r.category?.id === seed.catFood.id)?.cents) ?? 0;
  assert.strictEqual(after, before + 4444, "餐饮分类支出应增加 4444 分");
});

test("F6-04 分类占比：pct 与「分类金额/该类型有分类总额」一致且合计 100", async () => {
  asU1();
  await createCategory({ name: "娱乐占比", type: "expense" });
  const [c] = await db.select().from(categoriesT).where(eq(categoriesT.name, "娱乐占比")).limit(1);
  assert.ok(c, "辅助分类应存在");
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: c.id,
    amountYuan: "10.00", txDate: "2026-06-28", remark: "功能扩展-占比辅助",
  });
  const rows = await categoryBreakdown(seed.l1.id, "expense", YEAR2026);
  assert.ok(rows.length >= 2, "至少两个支出分类参与占比");
  const total = rows.reduce((s: number, r: any) => s + r.cents, 0);
  assert.ok(total > 0);
  const sumPct = rows.reduce((s: number, r: any) => s + r.pct, 0);
  assert.ok(Math.abs(sumPct - 100) < 0.01, `pct 合计应≈100，实际 ${sumPct}`);
  for (const r of rows) {
    const expect = (r.cents / total) * 100;
    assert.ok(Math.abs(r.pct - expect) < 0.1, `分类 ${r.category?.id} pct=${r.pct} 应≈${expect}`);
  }
});

test("F6-05 项目聚合：新增项目支出后 projectSummary 联动", async () => {
  asU1();
  const before = (await projectSummary(seed.l1.id, YEAR2026)).find((p: any) => p.id === seed.proj.id).expense;
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    projectId: seed.proj.id, amountYuan: "11.11", txDate: "2026-06-26", remark: "功能扩展-项目聚合",
  });
  const after = (await projectSummary(seed.l1.id, YEAR2026)).find((p: any) => p.id === seed.proj.id).expense;
  assert.strictEqual(after, before + 1111, "项目支出应增加 1111 分");
});

test("F6-06 标签聚合：新增标签支出后 tagSummary 联动", async () => {
  asU1();
  const before = (await tagSummary(seed.l1.id, YEAR2026)).find((t: any) => t.id === seed.tagDaily.id).expenseCents;
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    tagIds: [seed.tagDaily.id], amountYuan: "22.22", txDate: "2026-06-27", remark: "功能扩展-标签聚合",
  });
  const after = (await tagSummary(seed.l1.id, YEAR2026)).find((t: any) => t.id === seed.tagDaily.id).expenseCents;
  assert.strictEqual(after, before + 2222, "标签支出应增加 2222 分");
});

test("F6-07 年度汇总：跨月流水进入对应月份槽位", async () => {
  asU1();
  const before = await yearSummary(seed.l1.id, 2026);
  await createTransaction({
    type: "expense", accountId: seed.ac1.id, categoryId: seed.catFood.id,
    amountYuan: "33.33", txDate: "2026-07-15", remark: "功能扩展-年度汇总",
  });
  const after = await yearSummary(seed.l1.id, 2026);
  assert.strictEqual(after.length, 12);
  assert.strictEqual(after[6].expense, before[6].expense + 3333, "7 月支出应增加 3333 分");
  assert.strictEqual(after[6].income, before[6].income);
});

/* ==================== 全局拦截恢复 ====================
 * 本文件通过 require.extensions / Module._load 修改了全局模块加载器；
 * 若 npm test 在单进程内串行加载多个测试文件，残留拦截会破坏后续文件
 * （如 import-export-e2e 依赖真实 next-intl/server 的错误消息文本）。
 * 所有测试结束后恢复原始加载器，尽量把副作用限制在本文件运行期间。
 */
after(async () => {
  Module._load = origLoad;
  Module._extensions[".js"] = origJs;
  Module._extensions[".ts"] = origTs;
});
