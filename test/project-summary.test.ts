/**
 * ratcount · 项目盈亏聚合测试（含投资持仓 + 原币组成）
 *  - projectSummary 需聚合 transactions（按 project_id）与 investment_holdings（status=active, 按 project_id）
 *  - 原币组成按 currencyCode 分组（交易收支净额 + 持仓市值），多币种时返回多条
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/project-summary.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, seedTestData, SEED_TX_DATE } from "./helpers/db-fixture";

let db: any;
let seed: any;
let projects: any;
let transactions: any;
let investmentHoldings: any;
let accounts: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({ projects, transactions, investmentHoldings, accounts } = await import("../db/schema"));
});

/** 插入一条带项目的交易 / insert a project-tagged transaction */
async function insertTx(p: Record<string, unknown>) {
  const [row] = await db
    .insert(transactions)
    .values({ ledgerId: seed.l1.id, accountId: seed.ac1.id, txDate: SEED_TX_DATE, createdBy: seed.u1.id, ...p })
    .returning();
  return row;
}

test("projectSummary：聚合交易 + 关联持仓（基准口径），并输出多币种原币组成", async () => {
  const { projectSummary } = await import("../lib/queries/reports");
  const { STATS_PERIOD } = await import("../lib/constants");

  // 新建一个独立项目，避免与种子「装修」串扰 / isolated project
  const [P] = await db
    .insert(projects)
    .values({ ledgerId: seed.l1.id, name: "投资计划", status: "active", createdBy: seed.u1.id })
    .returning();

  // 交易：项目收入 1000.00（CNY）/ project income in CNY
  await insertTx({ projectId: P.id, type: "income", amountCents: 100000 });

  // 美元账户（供 USD 持仓，避免触发器把币种改写为账户币种）/ USD account so holding currency stays USD
  const [acUsd] = await db
    .insert(accounts)
    .values({ ledgerId: seed.l1.id, name: "美股账户", type: "investment", currencyCode: "USD", openingBalanceCents: 0, isAsset: true, createdBy: seed.u1.id })
    .returning();

  // 持仓 A（CNY）：成本 500.00 / 市值 600.00 → 基准相同（rate=1）
  await db.insert(investmentHoldings).values({
    ledgerId: seed.l1.id, createdBy: seed.u1.id, type: "stock", name: "A股", accountId: seed.ac2.id,
    projectId: P.id, status: "active", costCents: 50000, currentValueCents: 60000,
    baseCostCents: 50000, baseValueCents: 60000, currencyCode: "CNY",
  });
  // 持仓 B（USD）：成本 100.00 / 市值 120.00 → 基准 = ×7.2 = 720.00 / 864.00
  await db.insert(investmentHoldings).values({
    ledgerId: seed.l1.id, createdBy: seed.u1.id, type: "stock", name: "美股", accountId: acUsd.id,
    projectId: P.id, status: "active", costCents: 10000, currentValueCents: 12000,
    baseCostCents: 72000, baseValueCents: 86400, currencyCode: "USD",
  });
  // 持仓 C（已结算）：不应计入 / sold holding must be excluded
  await db.insert(investmentHoldings).values({
    ledgerId: seed.l1.id, createdBy: seed.u1.id, type: "stock", name: "已卖", accountId: seed.ac2.id,
    projectId: P.id, status: "sold", costCents: 99999, currentValueCents: 99999,
    baseCostCents: 99999, baseValueCents: 99999, currencyCode: "CNY",
  });

  const rows = await projectSummary(seed.l1.id, { type: STATS_PERIOD.year, year: 2026 }, "UTC");
  const row = rows.find((r: any) => r.id === P.id);
  assert.ok(row, "应返回该项目行");

  // 交易口径（基准=原币，CNY）/ transaction totals
  assert.equal(row.income, 100000);
  assert.equal(row.expense, 0);
  assert.equal(row.balance, 100000);

  // 持仓口径（基准币种汇总；已结算 excluded）/ holdings in base currency
  assert.equal(row.investCost, 50000 + 72000);
  assert.equal(row.investValue, 60000 + 86400);
  assert.equal(row.investProfit, row.investValue - row.investCost);

  // 原币组成：CNY = 收入100000 + 市值60000；USD = 市值12000 / native breakdown
  assert.equal(row.nativeBreakdown.length, 2, "应含两个币种");
  const byCur = new Map(row.nativeBreakdown.map((b: any) => [b.currency, b.amountCents]));
  assert.equal(byCur.get("CNY"), 160000);
  assert.equal(byCur.get("USD"), 12000);
});

test("projectSummary：无投资持仓的项目不返回投资块与原币组成", async () => {
  const { projectSummary } = await import("../lib/queries/reports");
  const { STATS_PERIOD } = await import("../lib/constants");

  // 种子「装修」项目仅有交易（无持仓）/ seed project has tx but no holdings
  const rows = await projectSummary(seed.l1.id, { type: STATS_PERIOD.year, year: 2026 }, "UTC");
  const row = rows.find((r: any) => r.id === seed.proj.id);
  assert.ok(row, "应返回种子项目行");
  assert.equal(row.investCost, 0);
  assert.equal(row.investValue, 0);
  assert.equal(row.investProfit, 0);
  // 种子项目仅有单币种（CNY）交易，原币组成不超过 1 种 / single currency only
  assert.ok(!row.nativeBreakdown.some((b: any) => b.currency !== "CNY"), "不应含其他币种的原币组成");
});
