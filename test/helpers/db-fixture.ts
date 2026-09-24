/**
 * ratcount · DB 测试夹具（test helper）
 *  - 为 DB 相关测试（functional / security）提供独立临时 SQLite：
 *    1) 在 import lib/db 之前注入环境变量（指向临时文件 DB）
 *    2) 按 db/schema.ts 的真实 DDL 建表（15 张，含关键唯一索引）
 *    3) 提供种子数据（2 用户 / 2 账本 / 账户 / 分类 / 标签 / 项目 / 流水 / 标签关联 / 余额快照）
 *  - node --test 每个测试文件运行在独立进程，天然互不干扰
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { sql } from "drizzle-orm";

/** 与 db/schema.ts 对齐的建表 DDL（列名/类型/唯一约束一致性） */
const DDL_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    token_version INTEGER NOT NULL DEFAULT 0,
    remark TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (email)
  )`,
  `CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📒',
    base_currency_code TEXT NOT NULL DEFAULT 'CNY',
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ledger_members (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT NOT NULL,
    UNIQUE (ledger_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    name TEXT,
    user_id TEXT NOT NULL DEFAULT 'global',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS currencies (
    code TEXT PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT '¥',
    name TEXT NOT NULL DEFAULT '',
    rate TEXT NOT NULL DEFAULT '1',
    is_base INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    remark TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    icon TEXT NOT NULL DEFAULT '💳',
    currency_code TEXT NOT NULL DEFAULT 'CNY',
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    base_opening_balance_cents INTEGER,
    is_asset INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    sort INTEGER NOT NULL DEFAULT 0,
    remark TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#0d9488',
    remark TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📁',
    budget_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    start_date TEXT,
    end_date TEXT,
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    to_account_id TEXT,
    type TEXT NOT NULL,
    category_id TEXT,
    project_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'CNY',
    to_currency_code TEXT,
    used_rate_from TEXT,
    used_rate_to TEXT,
    to_amount_cents INTEGER,
    base_amount_cents INTEGER,
    tx_date TEXT NOT NULL,
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_tags (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (transaction_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT,
    summary_key TEXT,
    summary_params TEXT,
    request_body TEXT,
    response_body TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS balances (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    balance_amount_cents INTEGER NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'CNY',
    used_rate TEXT,
    base_balance_amount_cents INTEGER,
    snapshot_date TEXT NOT NULL,
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (ledger_id, account_id, snapshot_date)
  )`,
  `CREATE TABLE IF NOT EXISTS recurring_plans (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    day_of_month INTEGER,
    day_of_week INTEGER,
    account_id TEXT NOT NULL,
    to_account_id TEXT,
    category_id TEXT,
    project_id TEXT,
    next_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    remark TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS investment_holdings (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    type TEXT NOT NULL,
    sub_type TEXT,
    name TEXT NOT NULL,
    code TEXT,
    account_id TEXT,
    payment_account_id TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    fee_cents INTEGER NOT NULL DEFAULT 0,
    current_value_cents INTEGER NOT NULL DEFAULT 0,
    purchase_date TEXT,
    maturity_date TEXT,
    interest_rate TEXT,
    location TEXT,
    area_sqm INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    dividend_cents INTEGER NOT NULL DEFAULT 0,
    currency_code TEXT NOT NULL DEFAULT 'CNY',
    used_rate TEXT,
    base_cost_cents INTEGER,
    base_fee_cents INTEGER,
    base_value_cents INTEGER,
    base_dividend_cents INTEGER,
    remark TEXT,
    project_id TEXT,
    buy_transaction_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS holding_tags (
    id TEXT PRIMARY KEY,
    holding_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (holding_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS menu_groups (
    menu_group_id TEXT PRIMARY KEY,
    name TEXT DEFAULT '{}' NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    remark TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS menus (
    menu_id TEXT PRIMARY KEY,
    name TEXT DEFAULT '{}' NOT NULL,
    icon TEXT NOT NULL DEFAULT '🛝',
    menu_group_id TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    status_code TEXT NOT NULL DEFAULT 'active',
    device_type TEXT NOT NULL DEFAULT 'desktop',
    link TEXT NOT NULL,
    remark TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_menu_config (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    menu_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (ledger_id, user_id, menu_id)
  )`,
  `CREATE TABLE IF NOT EXISTS languages (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    native_name TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // 测试库触发器：模拟生产服务的「写入期快照 base*」，使直接 .values 插入的测试数据也带基准列（否则 base 默认 0 会让净资产/报表聚合失真）。
  // 触发条件同时覆盖 NULL 与 0：drizzle 的 insert 会把带默认值的列显式写为 0，故用 =0 兜底；生产服务写入非零值则不触发，仍用服务计算的 base。
  `CREATE TRIGGER IF NOT EXISTS trg_tx_base AFTER INSERT ON transactions WHEN NEW.base_amount_cents IS NULL OR NEW.base_amount_cents = 0 BEGIN
     UPDATE transactions SET
       currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id), 'CNY'),
       used_rate_from = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id)), '1'),
       base_amount_cents = NEW.amount_cents,
       to_currency_code = (SELECT currency_code FROM accounts WHERE accounts.id = NEW.to_account_id),
       to_amount_cents = CASE WHEN NEW.to_account_id IS NOT NULL THEN NEW.amount_cents ELSE NULL END
     WHERE id = NEW.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_bal_base AFTER INSERT ON balances WHEN NEW.base_balance_amount_cents IS NULL OR NEW.base_balance_amount_cents = 0 BEGIN
     UPDATE balances SET
       currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id), 'CNY'),
       used_rate = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id)), '1'),
       base_balance_amount_cents = NEW.balance_amount_cents
     WHERE id = NEW.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_inv_base AFTER INSERT ON investment_holdings WHEN NEW.base_cost_cents IS NULL OR NEW.base_cost_cents = 0 BEGIN
     UPDATE investment_holdings SET
       currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id), 'CNY'),
       used_rate = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = NEW.account_id)), '1'),
       base_cost_cents = NEW.cost_cents,
       base_fee_cents = NEW.fee_cents,
       base_value_cents = NEW.current_value_cents,
       base_dividend_cents = NEW.dividend_cents
     WHERE id = NEW.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_acct_base AFTER INSERT ON accounts WHEN NEW.base_opening_balance_cents IS NULL OR NEW.base_opening_balance_cents = 0 BEGIN
     UPDATE accounts SET base_opening_balance_cents = NEW.opening_balance_cents WHERE id = NEW.id;
   END`,
];

/** 初始化测试 DB：注入环境变量 + 动态 import lib/db（保证 env 先于模块求值生效）+ 建表 */
export async function setupTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ratcount-test-"));
  const dbFile = path.join(dir, "test.db");
  (process.env as any).NODE_ENV = "test";
  process.env.DATABASE_MODE = "file";
  process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;
  process.env.AUTH_SECRET = "test-auth-secret-ratcount-20260101";
  (process.env as any).TURSO_AUTH_TOKEN = "";

  const { db } = await import("../../lib/db");
  // 消除并发/事务场景的 SQLITE_BUSY：写锁忙等而非立即失败（仅测试临时库生效）
  await db.run(sql.raw("PRAGMA busy_timeout = 5000"));
  for (const ddl of DDL_TABLES) {
    await db.run(sql.raw(ddl));
  }
  return { db, dir, dbFile };
}

/** 种子数据的中立日期（固定，保证报表/统计断言稳定） */
export const SEED_TX_DATE = "2026-06-15";

/** 写入种子数据，返回关键 ID 供断言使用 */
export async function seedTestData(db: any) {
  const { users, ledgers, ledgerMembers, currencies, accounts, categories, tags, projects, transactions, transactionTags, balances } =
    await import("../../db/schema");

  const [u1] = await db.insert(users).values({
    email: "alice@test.com", passwordHash: "x", name: "Alice", role: "admin", status: "active",
  }).returning();
  const [u2] = await db.insert(users).values({
    email: "bob@test.com", passwordHash: "y", name: "Bob", role: "user", status: "active",
  }).returning();

  const [l1] = await db.insert(ledgers).values({ name: "家庭账本", createdBy: u1.id }).returning();
  const [l2] = await db.insert(ledgers).values({ name: "工作账本", createdBy: u2.id }).returning();

  await db.insert(ledgerMembers).values([
    { ledgerId: l1.id, userId: u1.id, role: "owner" },
    { ledgerId: l2.id, userId: u2.id, role: "owner" },
  ]);

  await db.insert(currencies).values([
    { code: "CNY", symbol: "¥", name: "人民币 CNY", rate: "1", isBase: true, isActive: true, sort: 0 },
    { code: "USD", symbol: "$", name: "美元 USD", rate: "7.2", isBase: false, isActive: true, sort: 1 },
  ]);

  const [ac1] = await db.insert(accounts).values({
    ledgerId: l1.id, name: "现金", type: "cash", openingBalanceCents: 10000, isAsset: true, createdBy: u1.id,
  }).returning();
  const [ac2] = await db.insert(accounts).values({
    ledgerId: l1.id, name: "借记卡", type: "debit_card", openingBalanceCents: 500000, isAsset: true, createdBy: u1.id,
  }).returning();
  const [ac3] = await db.insert(accounts).values({
    ledgerId: l2.id, name: "工作卡", type: "debit_card", openingBalanceCents: 0, isAsset: true, createdBy: u2.id,
  }).returning();

  const [catFood] = await db.insert(categories).values({ ledgerId: l1.id, name: "餐饮", type: "expense" }).returning();
  const [catSalary] = await db.insert(categories).values({ ledgerId: l1.id, name: "工资", type: "income" }).returning();

  const [tagDaily] = await db.insert(tags).values({ ledgerId: l1.id, name: "日常", color: "#0d9488" }).returning();

  const [proj] = await db.insert(projects).values({
    ledgerId: l1.id, name: "装修", budgetCents: 200000, status: "active", createdBy: u1.id,
  }).returning();

  // 账本 1：支出 4800(项目+标签) / 支出 1500 / 收入 800000 / 转账 20000（现金→借记卡）
  const [t1] = await db.insert(transactions).values({
    ledgerId: l1.id, accountId: ac1.id, type: "expense", categoryId: catFood.id, projectId: proj.id,
    amountCents: 4800, txDate: SEED_TX_DATE, remark: "山姆会员店", createdBy: u1.id,
  }).returning();
  await db.insert(transactions).values({
    ledgerId: l1.id, accountId: ac1.id, type: "expense", categoryId: catFood.id,
    amountCents: 1500, txDate: SEED_TX_DATE, remark: "午餐", createdBy: u1.id,
  });
  await db.insert(transactions).values({
    ledgerId: l1.id, accountId: ac2.id, type: "income", categoryId: catSalary.id,
    amountCents: 800000, txDate: SEED_TX_DATE, remark: "本月工资", createdBy: u1.id,
  });
  await db.insert(transactions).values({
    ledgerId: l1.id, accountId: ac1.id, toAccountId: ac2.id, type: "transfer",
    amountCents: 20000, txDate: SEED_TX_DATE, remark: "转入卡", createdBy: u1.id,
  });
  // 账本 2：1 条，验证隔离
  await db.insert(transactions).values({
    ledgerId: l2.id, accountId: ac3.id, type: "income",
    amountCents: 12345, txDate: SEED_TX_DATE, remark: "工作收入", createdBy: u2.id,
  });

  await db.insert(transactionTags).values({ transactionId: t1.id, tagId: tagDaily.id });

  await db.insert(balances).values({
    ledgerId: l1.id, accountId: ac1.id, balanceAmountCents: 8000, snapshotDate: SEED_TX_DATE, createdBy: u1.id,
  });

  return { u1, u2, l1, l2, ac1, ac2, ac3, catFood, catSalary, tagDaily, proj, t1 };
}
