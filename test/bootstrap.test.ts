/**
 * ratcount · 启动时列迁移幂等（bootstrap）
 *
 * 覆盖：
 *   - ensureSchema 重复调用不抛错（已迁移库再次启动安全，避免云端模式下「缺列 500」这类问题在本地复现）
 *   - 关键列（investment_holding_id / base_amount_cents / currency_code / to_amount_cents）与索引（tx_ledger_holding_idx）存在
 *
 * 依赖：test/helpers/db-fixture.ts（DATABASE_MODE=file 的临时 SQLite）
 * 运行：npx tsx --test test/bootstrap.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

import { setupTestDb } from "./helpers/db-fixture";

let db: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
});

test("ensureSchema 幂等：重复调用不报错且关键列/索引存在", async () => {
  const { ensureSchema } = await import("../lib/db/bootstrap");

  // 首次 + 二次调用都应安全（列已存在 → 不 ALTER；索引 IF NOT EXISTS）
  await ensureSchema();
  await ensureSchema();

  const cols = (await db.all(sql.raw(`PRAGMA table_info("transactions")`))) as Array<{ name: string }>;
  const names = cols.map((c) => c.name);
  for (const col of ["investment_holding_id", "base_amount_cents", "currency_code", "to_amount_cents"]) {
    assert.ok(names.includes(col), `transactions 应存在列 ${col}`);
  }

  const idx = (await db.all(sql.raw(`PRAGMA index_list("transactions")`))) as Array<{ name: string }>;
  assert.ok(idx.some((i: any) => i.name === "tx_ledger_holding_idx"), "tx_ledger_holding_idx 应存在");
});
