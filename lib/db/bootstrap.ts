// ratcount · 桌面建表引导（无迁移文件，运行时幂等建表）/ Desktop schema bootstrap (no migration files; idempotent CREATE TABLE at runtime)
//  - 由 db/schema.ts 自省生成 DDL（21 张表 + 索引），主进程启动时执行一次；
//  - 每张表 IF NOT EXISTS，重复启动安全；升级 schema 时扩展 db/schema.ts 后重启即自动补齐新表/列。
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

type TableLike = Parameters<typeof getTableConfig>[0];

// 筛出全部 sqliteTable 定义（排除聚合导出对象 schema 与非表导出）
const TABLES: TableLike[] = Object.entries(schema)
  .filter(([key, value]) => {
    if (key === "schema") return false; // 聚合导出对象，非表
    try {
      const cfg = getTableConfig(value as TableLike);
      return typeof cfg.name === "string" && cfg.name.length > 0;
    } catch {
      return false;
    }
  })
  .map(([, value]) => value as TableLike);

/** 确保本地数据库文件存在（无则创建）。
 *  libsql 的 file: 客户端是惰性连接：父目录不存在会 SQLITE_CANTOPEN；
 *  首次 execute 才真正建文件。这里先保证目录存在，再交由后续 CREATE TABLE 建库+建表。
 *  仅对 file: 本地 SQLite 生效；libsql: 云端 URL 跳过。 */
function ensureDatabaseFile(): void {
  const url = env.DATABASE_URL;
  if (!url.startsWith("file:")) return; // 仅本地 SQLite 需要
  const path = url.slice("file:".length); // 去掉 "file:" 前缀
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (e) {
    console.error("[db] 无法创建数据库目录", dirname(path), e);
  }
}

/** 幂等建表 + 索引（供桌面主进程启动时调用一次） */
export async function ensureSchema(): Promise<void> {
  ensureDatabaseFile();
  // 本地 SQLite 强制 WAL 模式：Turso 嵌入式副本 / CLI 上传要求本地库为 WAL；
  // 同时在写多读少场景下提升并发（读写互不阻塞）。仅对 file: 本地库生效，云端模式跳过。
  if (env.DATABASE_MODE === "file") {
    await db.run(sql.raw("PRAGMA journal_mode=WAL"));
  }
  for (const table of TABLES) {
    const cfg = getTableConfig(table) as unknown as {
      name: string;
      columns: Array<{ name: string; getSQLType(): string; primary: boolean; notNull: boolean }>;
      indexes?: Array<{ config: { name: string; columns: Array<{ name: string }>; unique: boolean } }>;
    };

    const colDefs = cfg.columns.map((col) => {
      const parts = [`"${col.name}"`, col.getSQLType()];
      if (col.primary) parts.push("PRIMARY KEY");
      else if (col.notNull) parts.push("NOT NULL");
      return parts.join(" ");
    });

    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS "${cfg.name}" (${colDefs.join(", ")})`));

    for (const idx of cfg.indexes ?? []) {
      const c = idx.config;
      const cols = c.columns.map((col) => `"${col.name}"`).join(", ");
      const unique = c.unique ? "UNIQUE " : "";
      await db.run(sql.raw(`CREATE ${unique}INDEX IF NOT EXISTS "${c.name}" ON "${cfg.name}" (${cols})`));
    }
  }

  // 列迁移：ensureSchema 仅 CREATE TABLE IF NOT EXISTS，不会给已存在表加列。
  // 用 PRAGMA table_info 检查列是否存在，缺失才 ALTER，兼容老版本 SQLite（比 ADD COLUMN IF NOT EXISTS 更稳）。
  // Column migration: CREATE TABLE IF NOT EXISTS won't add columns to existing tables;
  // check via PRAGMA table_info and ALTER only when missing (works on older SQLite too).
  await ensureColumn("investment_holdings", "buy_transaction_id", "TEXT");

  // 多币种列：原币代码、快照汇率、基准币种分（net worth / 报表统一按 base* 聚合，历史不可变）
  await ensureColumn("accounts", "base_opening_balance_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("transactions", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  await ensureColumn("transactions", "to_currency_code", "TEXT");
  await ensureColumn("transactions", "used_rate_from", "TEXT");
  await ensureColumn("transactions", "used_rate_to", "TEXT");
  await ensureColumn("transactions", "to_amount_cents", "INTEGER");
  await ensureColumn("transactions", "base_amount_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("transactions", "investment_holding_id", "TEXT");
  await ensureColumn("balances", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  await ensureColumn("balances", "used_rate", "TEXT");
  await ensureColumn("balances", "base_balance_amount_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("investment_holdings", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  await ensureColumn("investment_holdings", "used_rate", "TEXT");
  await ensureColumn("investment_holdings", "base_cost_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("investment_holdings", "base_fee_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("investment_holdings", "base_value_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("investment_holdings", "base_dividend_cents", "INTEGER NOT NULL DEFAULT 0");
  // 后续版本新增列（老库 ALTER 补列；新库已存在则跳过）：投资持仓 / columns added in later revisions
  await ensureColumn("investment_holdings", "direction", "TEXT");
  await ensureColumn("investment_holdings", "project_id", "TEXT");
  await ensureColumn("investment_holdings", "sub_type", "TEXT");
  await ensureColumn("investment_holdings", "area_sqm", "INTEGER");
  await ensureColumn("investment_holdings", "code", "TEXT");
  await ensureColumn("investment_holdings", "location", "TEXT");
  await ensureColumn("investment_holdings", "remark", "TEXT");
  await ensureColumn("investment_holdings", "buy_transaction_id", "TEXT");
  await ensureColumn("investment_holdings", "used_rate", "TEXT");
  await ensureColumn("investment_holdings", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  // 流水 / transactions
  await ensureColumn("transactions", "to_account_id", "TEXT");
  await ensureColumn("transactions", "project_id", "TEXT");
  await ensureColumn("transactions", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  await ensureColumn("transactions", "to_currency_code", "TEXT");
  await ensureColumn("transactions", "used_rate_from", "TEXT");
  await ensureColumn("transactions", "used_rate_to", "TEXT");
  await ensureColumn("transactions", "to_amount_cents", "INTEGER");
  await ensureColumn("transactions", "base_amount_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("transactions", "investment_holding_id", "TEXT");
  await ensureColumn("transactions", "remark", "TEXT");
  // 账户 / accounts
  await ensureColumn("accounts", "currency_code", "TEXT NOT NULL DEFAULT 'CNY'");
  await ensureColumn("accounts", "base_opening_balance_cents", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("accounts", "remark", "TEXT");

  // 存量数据回填（仅 file 模式、仅未迁移过的旧行）：把历史「基准币种分」口径补到 base* 列，
  // 币种按账户币种对齐；USD 等演示数据由重新生成的种子纠正（见 db/init）。
  await backfillCurrencyColumns();
}

/** 存量数据一次性回填：仅作用于未迁移过的旧行（usedRate 为空）。把历史以基准币种分存储的金额对齐到 base* 列。
 *  One-time backfill for legacy rows (usedRate IS NULL): align historical base-currency-cents into base* columns. */
async function backfillCurrencyColumns(): Promise<void> {
  if (env.DATABASE_MODE !== "file") return; // 云端 libsql 由迁移工具管理 / cloud libsql managed by migration tools
  try {
    // accounts：期初基准 = 期初（历史数据本就是基准币种分）
    await db.run(sql.raw(`UPDATE accounts SET base_opening_balance_cents = opening_balance_cents WHERE base_opening_balance_cents = 0`));
    // transactions：币种对齐账户；base=amount（历史数据已是基准币种分）；跨币种转账 toAmount=amount
    await db.run(sql.raw(`
      UPDATE transactions SET
        currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = transactions.account_id), 'CNY'),
        used_rate_from = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = transactions.account_id)), '1'),
        base_amount_cents = amount_cents,
        to_currency_code = (SELECT currency_code FROM accounts WHERE accounts.id = transactions.to_account_id),
        to_amount_cents = CASE WHEN to_account_id IS NOT NULL THEN amount_cents ELSE NULL END
      WHERE used_rate_from IS NULL
    `));
    // balances：币种对齐账户；base=balance
    await db.run(sql.raw(`
      UPDATE balances SET
        currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = balances.account_id), 'CNY'),
        used_rate = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = balances.account_id)), '1'),
        base_balance_amount_cents = balance_amount_cents
      WHERE used_rate IS NULL
    `));
    // investment_holdings：币种对齐账户；base=各原币列
    await db.run(sql.raw(`
      UPDATE investment_holdings SET
        currency_code = COALESCE((SELECT currency_code FROM accounts WHERE accounts.id = investment_holdings.account_id), 'CNY'),
        used_rate = COALESCE((SELECT COALESCE(rate,'1') FROM currencies WHERE code = (SELECT currency_code FROM accounts WHERE accounts.id = investment_holdings.account_id)), '1'),
        base_cost_cents = cost_cents,
        base_fee_cents = fee_cents,
        base_value_cents = current_value_cents,
        base_dividend_cents = dividend_cents
      WHERE used_rate IS NULL
    `));
  } catch (e) {
    console.error("[db] 多币种列回填失败（可忽略，下次启动重试）", e);
  }
}

/** 幂等补列：检查表是否存在某列，不存在则 ALTER TABLE ADD COLUMN。仅对 file: 本地库生效，云端模式跳过。
 *  Idempotent column add: add a column only if it does not exist on the table. Local file DB only. */
async function ensureColumn(table: string, column: string, sqlType: string): Promise<void> {
  if (env.DATABASE_MODE !== "file") return; // 云端 libsql 由迁移工具管理，本地不做 ALTER / cloud libsql managed by migration tools
  const rows = (await db.all(sql.raw(`PRAGMA table_info("${table}")`))) as Array<{ name: string }>;
  const exists = rows.some((r) => r.name === column);
  if (!exists) {
    await db.run(sql.raw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType}`));
  }
}
