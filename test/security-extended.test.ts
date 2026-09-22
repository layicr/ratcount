/**
 * ratcount · 安全扩展测试（security-test-cases.md 未自动化项）
 *
 * 覆盖：
 *  - S1 会话 Cookie 属性：@auth/core defaultCookies 的 HttpOnly / SameSite / Secure / Path
 *  - S2 写操作越权：viewer 角色调用 createTransaction / createAccount 被拒；非 admin 调 deleteAuditLogs 被拒
 *  - S4 XSS 防护：存储型载荷原样落库（依赖 React 渲染转义）、反射型搜索参数化不放大、渲染层无危险注入点
 *  - S5 CSRF 真实请求防护：Server Actions 全量 "use server"（内置 Origin/Host 校验）、
 *       cron 端点无/错 Bearer 被拒
 *  - S7 审计隔离与删除自反：listAuditLogs 按 userId 隔离、查询不产生审计、
 *      deleteAuditLogs / clearExpiredLogs 仅 admin 可调且删除动作自反留痕
 *
 * 技术要点（单文件内切换 viewer/admin 身份）：
 *  - require.extensions 钩子把 react.cache 打平为 no-op，使 requireUser/requireLedgerAccess
 *    每次重新执行，测试中通过可变 currentUser 切换登录身份；
 *  - 根 auth.ts 替换为返回 currentUser 的假模块（排除 lib/auth 与 app/actions/auth）；
 *  - next/headers.cookies 返回空 store、next/cache.revalidatePath 打平为 no-op。
 *
 * 运行：npx tsx --test test/security-extended.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { eq, and } from "drizzle-orm";

/* ==================== 模块钩子（必须在业务模块加载前注册） ==================== */

/** 可变登录身份：S2 用 viewer，S7 用 admin */
let currentUser: { id: string; role: string } | null = null;

const Module = require("node:module");
const origJs = Module._extensions[".js"];
const origTs = Module._extensions[".ts"];
let reactCachePatched = false;

Module._extensions[".js"] = function (module: any, filename: string) {
  // react.cache → no-op：打破 requireUser / requireLedgerAccess 的无参缓存，允许单文件切换身份
  if (!reactCachePatched && /[\\/]node_modules[\\/]react[\\/]/.test(filename)) {
    try {
      if (module.exports && typeof module.exports === "object" && "cache" in module.exports) {
        module.exports.cache = (fn: any) => fn;
        reactCachePatched = true;
      }
    } catch {
      /* 忽略非 react 主入口 */
    }
  }
  // next/headers：cookies 返回空 store（node 下不可用）
  if (/[\\/]node_modules[\\/]next[\\/]headers\.js$/.test(filename)) {
    const emptyStore = {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      getAll: () => [],
    };
    module.exports = {
      cookies: async () => emptyStore,
      headers: async () => new Headers(),
      draftMode: () => ({ enable: () => {}, disable: () => {} }),
    };
    return;
  }
  // next/cache：revalidatePath 打平为 no-op
  if (/[\\/]node_modules[\\/]next[\\/]cache\.js$/.test(filename)) {
    module.exports = { revalidatePath: () => {}, revalidateTag: () => {} };
    return;
  }
  return origJs(module, filename);
};

Module._extensions[".ts"] = function (module: any, filename: string) {
  const n = path.normalize(filename);
  const isRootAuth =
    n.endsWith(`${path.sep}auth.ts`) &&
    !n.includes(`${path.sep}lib${path.sep}auth`) &&
    !n.includes(`${path.sep}app${path.sep}actions${path.sep}auth`);
  if (isRootAuth) {
    const mod = { exports: {} };
    mod.exports = {
      auth: async () => (currentUser ? { user: currentUser } : null),
      handlers: { GET: async () => new Response(null, { status: 401 }), POST: async () => new Response(null, { status: 401 }) },
      signIn: async () => null,
      signOut: async () => null,
    };
    module.exports = mod.exports;
    return;
  }
  return origTs(module, filename);
};

/* ==================== 夹具与动态加载 ==================== */

let db: any;
let seed: any;
let listAuditLogs: any;
let createTransaction: any;
let createAccount: any;
let deleteAuditLogs: any;
let clearExpiredLogs: any;
let cleanupRouteGET: any;
let ROLE: any;
let AUDIT_ACTION: any;
let ENTITY: any;

before(async () => {
  const { setupTestDb, seedTestData } = await import("./helpers/db-fixture");
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);

  ({ listAuditLogs } = await import("../lib/queries/admin"));
  ({ createTransaction } = await import("../app/actions/transactions"));
  ({ createAccount } = await import("../app/actions/accounts"));
  ({ deleteAuditLogs, clearExpiredLogs } = await import("../app/actions/logs"));
  ({ ROLE, AUDIT_ACTION, ENTITY } = await import("../lib/constants"));
  ({ GET: cleanupRouteGET } = await import("../app/api/cron/cleanup-audit/route"));
});

/* ==================== S1 会话 Cookie 属性 ==================== */

test("S1-1 会话Cookie(生产): __Secure- 前缀且 HttpOnly/SameSite=Lax/Secure/Path=/", async () => {
  const { defaultCookies } = await import("../node_modules/@auth/core/lib/utils/cookie.js");
  const cookies = defaultCookies(true);
  const st = cookies.sessionToken;
  assert.strictEqual(st.name, "__Secure-authjs.session-token");
  assert.strictEqual(st.options.httpOnly, true, "session token 必须 HttpOnly");
  assert.strictEqual(st.options.sameSite, "lax", "session token 必须 SameSite=Lax");
  assert.strictEqual(st.options.secure, true, "生产环境必须 Secure");
  assert.strictEqual(st.options.path, "/");

  const csrf = cookies.csrfToken;
  assert.strictEqual(csrf.name, "__Host-authjs.csrf-token");
  assert.strictEqual(csrf.options.httpOnly, true);
  assert.strictEqual(csrf.options.sameSite, "lax");
  assert.strictEqual(csrf.options.secure, true);
});

test("S1-2 会话Cookie(开发/HTTP): 无 __Secure- 前缀且 Secure=false，但仍 HttpOnly+SameSite=Lax", async () => {
  const { defaultCookies } = await import("../node_modules/@auth/core/lib/utils/cookie.js");
  const cookies = defaultCookies(false);
  const st = cookies.sessionToken;
  assert.strictEqual(st.name, "authjs.session-token");
  assert.strictEqual(st.options.secure, false, "非 HTTPS 下不强加 Secure（否则本地无法登录）");
  assert.strictEqual(st.options.httpOnly, true, "即使非 HTTPS 也必须 HttpOnly");
  assert.strictEqual(st.options.sameSite, "lax", "即使非 HTTPS 也必须 SameSite=Lax");
});

/* ==================== S2 写操作越权（viewer） ==================== */

async function setViewerWithLedger() {
  // 必须是库中真实存在的用户：requireUser 现在会对不上库的会话直接判未登录（fail-closed）；
  // 同时该用户只能有 l1 一个账本，否则 getCurrentLedgerId 会回退到其它（owner）账本
  const { users, ledgerMembers } = await import("../db/schema");
  const [viewer] = await db
    .insert(users)
    .values({ email: "viewer@test.com", passwordHash: "z", name: "Viewer", role: "user", status: "active" })
    .returning();
  currentUser = { id: viewer.id, role: "user" };
  await db.insert(ledgerMembers).values({ ledgerId: seed.l1.id, userId: viewer.id, role: "viewer" });
  return viewer;
}

test("S2-1 越权: viewer 调 createTransaction 被拒（NEXT_REDIRECT）且无交易/审计副作用", async () => {
  await setViewerWithLedger();
  const { transactions, auditLogs } = await import("../db/schema");
  const txBefore = (await db.select().from(transactions)).length;
  const auditBefore = (await db.select().from(auditLogs)).length;

  await assert.rejects(
    () => createTransaction({ type: "expense", amountYuan: "10", accountId: seed.ac1.id, categoryId: seed.catFood.id, txDate: "2026-09-01", remark: "x" }),
    /NEXT_REDIRECT/,
    "viewer 写入流水必须被重定向拒绝",
  );

  const txAfter = (await db.select().from(transactions)).length;
  const auditAfter = (await db.select().from(auditLogs)).length;
  assert.strictEqual(txAfter, txBefore, "被拒后不得产生交易副作用");
  assert.strictEqual(auditAfter, auditBefore, "被拒后不得产生审计副作用");
});

test("S2-2 越权: viewer 调 createAccount 被拒（NEXT_REDIRECT）且无账户/审计副作用", async () => {
  const { accounts, auditLogs } = await import("../db/schema");
  const acctBefore = (await db.select().from(accounts)).length;
  const auditBefore = (await db.select().from(auditLogs)).length;

  await assert.rejects(
    () => createAccount({ name: "越权账户", type: "cash", currencyCode: "CNY" }),
    /NEXT_REDIRECT/,
    "viewer 写入账户必须被重定向拒绝",
  );

  const acctAfter = (await db.select().from(accounts)).length;
  const auditAfter = (await db.select().from(auditLogs)).length;
  assert.strictEqual(acctAfter, acctBefore, "被拒后不得产生账户副作用");
  assert.strictEqual(auditAfter, auditBefore, "被拒后不得产生审计副作用");
});

test("S2-3 越权: 非 admin 调 deleteAuditLogs 返回 errors.adminOnly", async () => {
  // 真实存在的非 admin 用户（u2）：通过登录校验后由 requireAdmin 拒绝
  currentUser = { id: seed.u2.id, role: "user" };
  const res = await deleteAuditLogs(["fake-id"]);
  assert.deepStrictEqual(res, { ok: false, error: "errors.adminOnly" });
});

/* ==================== S4 XSS 防护 ==================== */

test("S4-1 存储型XSS: 载荷原样落库可检索（渲染转义由 React 承担，见 S4-3）", async () => {
  const { auditLogs } = await import("../db/schema");
  const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  await db.insert(auditLogs).values({
    userId: seed.u1.id,
    action: "C",
    entity: "transaction",
    summary: payload,
    createdAt: new Date().toISOString(),
  });
  const [row] = await db.select().from(auditLogs).where(eq(auditLogs.summary, payload)).limit(1);
  assert.ok(row, "XSS 载荷应被当作普通文本存储");
  assert.strictEqual(row.summary, payload, "DB 不得对载荷做任何实体转义（由渲染层转义）");
  const res = await listAuditLogs({ search: "<script>alert(1)</script>" });
  assert.ok(res.total >= 1, "载荷应可通过搜索命中（字面量匹配）");
  assert.strictEqual(res.rows[0].summary, payload, "查询返回原文，未执行、未截断");
});

test("S4-2 反射型XSS: 搜索参数化，注入串不放大结果、不抛错", async () => {
  const attack = "<script>alert('xss')</script>";
  const res = await listAuditLogs({ search: attack });
  assert.ok(Array.isArray(res.rows), "注入串应作为字面量搜索而非执行");
  const dirty = await listAuditLogs({ search: "%' OR 1=1 --" });
  assert.strictEqual(dirty.total, 0, "LIKE 通配符/注入串不得放大结果");
});

test("S4-3 渲染层: 全仓无任意 HTML 注入点（app 目录零 dangerouslySetInnerHTML）", async () => {
  const appDir = path.join(process.cwd(), "app");
  const hits: { file: string; count: number }[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts|jsx)$/.test(e.name)) {
        const src = fs.readFileSync(p, "utf8");
        const c = (src.match(/dangerouslySetInnerHTML/g) || []).length;
        if (c > 0) hits.push({ file: p, count: c });
      }
    }
  })(appDir);

  // 主题改由服务端直接渲染 <html class>（见 i18n/themes.ts resolveThemeCode），不再需要内联脚本注入
  assert.deepStrictEqual(
    hits,
    [],
    `全 app 目录不得出现 dangerouslySetInnerHTML（发现：${hits.map((h) => `${h.file}×${h.count}`).join(", ")}）`,
  );
});

/* ==================== S5 CSRF 真实请求防护 ==================== */

test("S5-1 CSRF: 全部 Server Action 首行 'use server'（Next.js 内置 Origin/Host 校验）", () => {
  const actionsDir = path.join(process.cwd(), "app", "actions");
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) files.push(p);
    }
  })(actionsDir);
  assert.ok(files.length >= 10, `应扫描到全部 action 文件，实际 ${files.length}`);
  for (const f of files) {
    const first = fs
      .readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.trim() !== "" && !l.trim().startsWith("//"));
    assert.ok(
      first?.trim().replace(/;\s*$/, "") === '"use server"',
      `${path.relative(process.cwd(), f)} 缺少 "use server"（实际首行: ${first?.trim()}）`,
    );
  }
});

test("S5-2 CSRF: cron 审计清理端点无/错 Bearer 返回 401（未授权跨站请求被拒）", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret-for-test";
  try {
    const noAuth = await cleanupRouteGET(new Request("http://localhost/api/cron/cleanup-audit") as any);
    assert.strictEqual(noAuth.status, 401, "无 Bearer 必须 401");
    const badAuth = await cleanupRouteGET(
      new Request("http://localhost/api/cron/cleanup-audit", {
        headers: { authorization: "Bearer wrong-secret" },
      }) as any,
    );
    assert.strictEqual(badAuth.status, 401, "错误 Bearer 必须 401");
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

/* ==================== S7 审计隔离与删除自反 ==================== */

test("S7-1 审计隔离: listAuditLogs({userId}) 仅返回本人记录，互不可见", async () => {
  const { auditLogs } = await import("../db/schema");
  await db.insert(auditLogs).values({ userId: seed.u1.id, action: "C", entity: "tag", summary: "甲-隔离", createdAt: new Date().toISOString() });
  await db.insert(auditLogs).values({ userId: seed.u2.id, action: "C", entity: "tag", summary: "乙-隔离", createdAt: new Date().toISOString() });

  const mine = await listAuditLogs({ userId: seed.u1.id });
  assert.ok(mine.rows.length >= 1);
  assert.ok(mine.rows.every((r: any) => r.userId === seed.u1.id), "u1 只能看到自己的日志");
  assert.ok(!mine.rows.some((r: any) => r.summary === "乙-隔离"), "u1 不可见 u2 的日志");

  const other = await listAuditLogs({ userId: seed.u2.id });
  assert.ok(other.rows.length >= 1);
  assert.ok(!other.rows.some((r: any) => r.summary === "甲-隔离"), "u2 不可见 u1 的日志");
});

test("S7-2 审计不记录查询: 浏览/查询审计不产生新审计行", async () => {
  const { auditLogs } = await import("../db/schema");
  const beforeCount = (await db.select().from(auditLogs)).length;
  await listAuditLogs({ userId: seed.u1.id });
  await listAuditLogs({ search: "任意查询" });
  const afterCount = (await db.select().from(auditLogs)).length;
  assert.strictEqual(afterCount, beforeCount, "查询类操作不得产生审计行");
});

test("S7-3 删除自反: admin 调 deleteAuditLogs 删除指定行且删除动作自身留痕", async () => {
  currentUser = { id: seed.u1.id, role: "admin" };
  const { auditLogs } = await import("../db/schema");
  const [target] = await db
    .insert(auditLogs)
    .values({ userId: seed.u1.id, action: "U", entity: "account", summary: "待删行", createdAt: new Date().toISOString() })
    .returning();

  const res = await deleteAuditLogs([target.id]);
  assert.deepStrictEqual(res, { ok: true, error: null });

  const gone = await db.select().from(auditLogs).where(eq(auditLogs.id, target.id)).limit(1);
  assert.strictEqual(gone.length, 0, "目标行应被删除");

  const selfRef = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, ENTITY.auditLog), eq(auditLogs.action, AUDIT_ACTION.delete), eq(auditLogs.userId, seed.u1.id), eq(auditLogs.summaryKey, "audit.auditLogsBatchDeleted")))
    .limit(1);
  assert.ok(selfRef.length >= 1, "删除动作必须自反留痕 entity=audit_log action=D");
  assert.strictEqual(selfRef[0].summaryKey, "audit.auditLogsBatchDeleted");
});

test("S7-4 清理自反: admin 调 clearExpiredLogs 删除超期行且清理动作自身留痕", async () => {
  currentUser = { id: seed.u1.id, role: "admin" };
  const { auditLogs } = await import("../db/schema");
  const expired = new Date(Date.now() - 730 * 24 * 3600 * 1000).toISOString();
  await db.insert(auditLogs).values({ userId: seed.u2.id, action: "C", entity: "tag", summary: "超期行", createdAt: expired });

  const res = await clearExpiredLogs();
  assert.deepStrictEqual(res, { ok: true, error: null });

  const gone = await db.select().from(auditLogs).where(eq(auditLogs.summary, "超期行")).limit(1);
  assert.strictEqual(gone.length, 0, "超期行应被清理");

  const selfRef = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, ENTITY.auditLog), eq(auditLogs.action, AUDIT_ACTION.delete), eq(auditLogs.userId, seed.u1.id), eq(auditLogs.summaryKey, "audit.auditLogsCleared")))
    .limit(1);
  assert.ok(selfRef.length >= 1, "清理动作必须自反留痕 entity=audit_log action=D");
  assert.strictEqual(selfRef[0].summaryKey, "audit.auditLogsCleared");
});
