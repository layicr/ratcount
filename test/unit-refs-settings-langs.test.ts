/**
 * ratcount · DB 支撑的补充测试（临时 SQLite + 种子数据）
 *
 * 覆盖本次补全中依赖数据库的模块：
 *  - lib/ledger-refs.ts  ensureCategory / ensureAccount（按名匹配复用 + 自动创建 + 缓存）
 *  - lib/settings.ts    getBoolSetting / getSettingForUser / getAllSettings（真值解析与用户隔离）
 *  - lib/pagination.ts  getPaginationConfig（全局设置解析分页）
 *  - lib/languages.ts   getEnabledLocales / getDefaultLocale / getLocaleLabels / 缓存失效
 *
 * 运行：npx tsx --test test/unit-refs-settings-langs.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

let db: any;
let seed: any;
let ensureCategory: any;
let ensureAccount: any;
let getBoolSetting: any;
let getSettingForUser: any;
let getAllSettings: any;
let getPaginationConfig: any;
let getEnabledLocales: any;
let getDefaultLocale: any;
let getLocaleLabels: any;
let invalidateLanguagesCache: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({ ensureCategory, ensureAccount } = await import("../lib/ledger-refs"));
  ({ getBoolSetting, getSettingForUser, getAllSettings } = await import("../lib/settings"));
  ({ getPaginationConfig } = await import("../lib/pagination"));
  ({
    getEnabledLocales,
    getDefaultLocale,
    getLocaleLabels,
    invalidateLanguagesCache,
  } = await import("../lib/languages"));
});

/* ==================== 1. 分页配置（全局设置解析） ==================== */

test("分页: getPaginationConfig 从全局设置解析，非法项过滤并排序", async () => {
  const { settings } = await import("../db/schema");
  // 5000 超出允许上限（>1000）应被过滤；乱序输入应排序
  await db.insert(settings).values([
    { userId: "global", key: "allowed_page_sizes", value: "100,5,20,5000" },
    { userId: "global", key: "default_page_size", value: "100" },
  ]);
  const cfg = await getPaginationConfig();
  assert.deepEqual(cfg, { allowedPageSizes: [5, 20, 100], defaultPageSize: 100 });
  // React cache：同请求内重复调用返回同一结果（不会重复查库/变化）
  const again = await getPaginationConfig();
  assert.deepEqual(again, cfg);
});

/* ==================== 2. settings: 布尔解析与用户隔离 ==================== */

test("settings: getBoolSetting 仅接受 true/1 为真，其余为假，缺失回退", async () => {
  const { settings } = await import("../db/schema");
  await db.insert(settings).values([
    { userId: "global", key: "g_bool_true", value: "true" },
    { userId: "global", key: "g_bool_one", value: "1" },
    { userId: "global", key: "g_bool_false", value: "false" },
    { userId: "global", key: "g_bool_zero", value: "0" },
    { userId: "global", key: "g_bool_yes", value: "yes" },
  ]);
  assert.strictEqual(await getBoolSetting("g_bool_true"), true);
  assert.strictEqual(await getBoolSetting("g_bool_one"), true);
  assert.strictEqual(await getBoolSetting("g_bool_false"), false);
  assert.strictEqual(await getBoolSetting("g_bool_zero"), false);
  assert.strictEqual(await getBoolSetting("g_bool_yes"), false);
  // 缺失键回退入参 fallback；无 fallback 参数默认 false
  assert.strictEqual(await getBoolSetting("g_missing", true), true);
  assert.strictEqual(await getBoolSetting("g_missing_2"), false);
});

test("settings: getSettingForUser 按用户隔离，不动全局与其它用户", async () => {
  const { settings } = await import("../db/schema");
  await db.insert(settings).values([
    { userId: seed.u1.id, key: "u_theme", value: "dark" },
  ]);
  assert.strictEqual(await getSettingForUser(seed.u1.id, "u_theme"), "dark");
  // 其他用户读不到（隔离）
  assert.strictEqual(await getSettingForUser(seed.u2.id, "u_theme"), null);
  // 全局维度也读不到用户级设置（表按 user_id 区分）
  const { getSetting } = await import("../lib/settings");
  assert.strictEqual(await getSetting("u_theme"), null);
});

test("settings: getAllSettings 聚合全部全局设置（含布尔/分页键）", async () => {
  const rows = await getAllSettings();
  const keys = rows.map((r: any) => r.key);
  assert.ok(keys.includes("g_bool_true"), `缺少已插入的全局键，实际: ${keys.join(",")}`);
  assert.ok(keys.includes("allowed_page_sizes"));
  assert.ok(keys.includes("default_page_size"));
});

/* ==================== 3. ledger-refs: 分类/账户主数据引用 ==================== */

test("ledger-refs: ensureCategory 同名同类型复用，名同类型异互不串用，入参缓存命中", async () => {
  await db.transaction(async (tx: any) => {
    const a = await ensureCategory(tx, seed.l1.id, "出行", "expense");
    const b = await ensureCategory(tx, seed.l1.id, "出行", "expense");
    assert.strictEqual(b, a, "同名同类型应复用同一分类");
    const c = await ensureCategory(tx, seed.l1.id, "出行", "income");
    assert.notStrictEqual(c, a, "同名不同收支类型应为不同分类");
    // 显式内存缓存命中时不再查库/建库
    const cache = new Map<string, string>([["expense::预设", "preset-id"]]);
    const d = await ensureCategory(tx, seed.l1.id, "预设", "expense", cache);
    assert.strictEqual(d, "preset-id");
    // 缓存写入可回填：创建后下次同 key 走缓存
    const e = await ensureCategory(tx, seed.l1.id, "回填", "expense", cache);
    assert.ok(e);
    const cachedKey = await ensureCategory(tx, seed.l1.id, "回填", "expense", cache);
    assert.strictEqual(cachedKey, e);
  });
});

test("ledger-refs: ensureAccount 自动创建默认属性，同名匹配复用，缓存优先", async () => {
  let createdId = "";
  await db.transaction(async (tx: any) => {
    createdId = await ensureAccount(tx, seed.l1.id, "新账户", { createdBy: seed.u1.id });
    // 同名再取 → 复用不重复建（事务内返回 id 一致）
    const id2 = await ensureAccount(tx, seed.l1.id, "新账户", { createdBy: seed.u1.id });
    assert.strictEqual(id2, createdId);
    // 显式缓存优先
    const cache = new Map<string, string>([["预设账户", "preset-acct"]]);
    assert.strictEqual(await ensureAccount(tx, seed.l1.id, "预设账户", { createdBy: seed.u1.id, cache }), "preset-acct");
  });
  // 事务提交后回读，验证默认属性（libsql batch 事务内回读不可见）
  const { accounts } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(accounts).where(eq(accounts.id, createdId)).limit(1);
  assert.ok(row, "账户应被创建");
  assert.strictEqual(row.type, "custom");
  assert.strictEqual(row.icon, "💳");
  assert.strictEqual(row.currencyCode, "CNY");
  assert.strictEqual(row.openingBalanceCents, 0);
  assert.strictEqual(row.isAsset, true);
  assert.strictEqual(row.createdBy, seed.u1.id);
});

/* ==================== 4. languages: 语言清单（DB 驱动 + 缓存失效） ==================== */

test("languages: 启用语言按 sort 排序、默认语言解析、标签含本语名", async () => {
  const { languages } = await import("../db/schema");
  await db.insert(languages).values([
    { code: "zh-CN", name: "中文", nativeName: "中文", isDefault: true, isEnabled: true, sort: 0 },
    { code: "en", name: "英文", nativeName: "English", isDefault: false, isEnabled: true, sort: 1 },
    { code: "zh-TW", name: "繁体中文", nativeName: "繁體中文", isDefault: false, isEnabled: false, sort: 2 },
  ]);
  const enabled = await getEnabledLocales();
  assert.deepEqual(enabled, ["zh-CN", "en"], "仅返回启用且按 sort 排序的语言");
  assert.strictEqual(await getDefaultLocale(), "zh-CN");
  const labels = await getLocaleLabels();
  assert.strictEqual(labels["zh-CN"], "中文");
  assert.strictEqual(labels.en, "English");
  assert.strictEqual(labels["zh-TW"], "繁體中文");
});

test("languages: 停用语言需 invalidateLanguagesCache 后刷新", async () => {
  const { languages } = await import("../db/schema");
  const { sql } = await import("drizzle-orm");
  // 90 秒 TTL 内缓存生效：改为禁用后不失效仍可见
  await db.update(languages).set({ isEnabled: false }).where(sql`code = 'en'`);
  const beforeInvalidate = await getEnabledLocales();
  assert.deepEqual(beforeInvalidate, ["zh-CN", "en"], "缓存未失效，en 仍被返回");
  // 显式失效后立即反应
  invalidateLanguagesCache();
  const after = await getEnabledLocales();
  assert.deepEqual(after, ["zh-CN"], "失效后 en 被排除");
});
