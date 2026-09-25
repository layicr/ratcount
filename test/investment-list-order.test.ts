/**
 * ratcount · 投资持仓列表排序（服务层，复用 DB 测试夹具）
 *
 * 覆盖：
 *   - 定期管理：按「起息日」降序（最近存入在前）
 *   - 其余类型（股票）：仍沿用市值降序，不受影响
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/investment-list-order.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";
import { accounts } from "../db/schema";

let db: any;
let seed: any;
let payer: any;
let createInvestmentService: any;
let listInvestmentsByType: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  const [payerAcct] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "付款账户", type: "cash",
    openingBalanceCents: 1_000_000, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  payer = payerAcct.id as string;
  ({ createInvestmentService } = await import("../lib/services/investments"));
  ({ listInvestmentsByType } = await import("../lib/queries/investments"));
});

test("定期管理：列表按起息日降序", async () => {
  const dates = ["2025-01-01", "2026-03-01", "2025-06-15"];
  for (let i = 0; i < dates.length; i++) {
    const res = await createInvestmentService(
      { id: seed.u1.id },
      seed.l1.id,
      {
        type: "deposit",
        name: `定存${i}`,
        accountId: seed.ac2.id,
        paymentAccountId: payer,
        quantity: 0,
        costYuan: "1000.00",
        feeYuan: "0",
        valueYuan: "1000.00",
        purchaseDate: dates[i],
      },
    );
    assert.equal(res.ok, true, JSON.stringify(res));
  }

  const { rows } = await listInvestmentsByType(seed.l1.id, "deposit");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r: any) => r.purchaseDate),
    ["2026-03-01", "2025-06-15", "2025-01-01"],
    "定期列表应按起息日降序",
  );
});

test("固收类（国债）：同样按起息日降序", async () => {
  const dates = ["2024-05-01", "2026-02-01", "2025-09-15"];
  for (let i = 0; i < dates.length; i++) {
    const res = await createInvestmentService(
      { id: seed.u1.id },
      seed.l1.id,
      {
        type: "bond",
        name: `国债${i}`,
        accountId: seed.ac2.id,
        paymentAccountId: payer,
        quantity: 0,
        costYuan: "1000.00",
        feeYuan: "0",
        valueYuan: "1000.00",
        purchaseDate: dates[i],
      },
    );
    assert.equal(res.ok, true, JSON.stringify(res));
  }

  const { rows } = await listInvestmentsByType(seed.l1.id, "bond");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r: any) => r.purchaseDate),
    ["2026-02-01", "2025-09-15", "2024-05-01"],
    "国债列表应按起息日降序",
  );
});

test("股票管理：仍按市值降序（不受定期排序影响）", async () => {
  const values = ["300.00", "900.00", "600.00"];
  for (let i = 0; i < values.length; i++) {
    const res = await createInvestmentService(
      { id: seed.u1.id },
      seed.l1.id,
      {
        type: "stock",
        name: `股票${i}`,
        accountId: seed.ac2.id,
        paymentAccountId: payer,
        quantity: 10,
        costYuan: "100.00",
        feeYuan: "0",
        valueYuan: values[i],
        purchaseDate: "2026-01-01",
      },
    );
    assert.equal(res.ok, true, JSON.stringify(res));
  }

  const { rows } = await listInvestmentsByType(seed.l1.id, "stock");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r: any) => Number(r.currentValueCents)),
    [90000, 60000, 30000],
    "股票列表应仍按市值降序",
  );
});
