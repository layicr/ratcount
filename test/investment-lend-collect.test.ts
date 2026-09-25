/**
 * ratcount · 借出收款修正：利息记为收入（非亏损支出）+ 支持部分收款
 * - 全额本金收回：本金转账回笼借出资产，持仓 → 已结清（matured）
 * - 部分收款：收回本金 < 剩余借出本金，借出资产按收回额减少，持仓保持 active
 * - 利息：记为现金收入（TX.income，投资收益），不再误记为亏损支出
 * - 超额收款：收回本金 > 剩余借出本金 → 拦截 errors.investment.collectPrincipalExceed
 * 运行：npx tsx --test test/investment-lend-collect.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";
import { accounts, investmentHoldings, transactions } from "../db/schema";
import { TX } from "../lib/constants";

let db: any;
let seed: any;
let listAccountsWithBalance: any;
let createInvestmentService: any;
let sellInvestmentService: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ listAccountsWithBalance } = await import("../lib/queries"));
  ({ createInvestmentService, sellInvestmentService } = await import("../lib/services/investments"));
  seed = await seedTestData(db);
});

// 借出场景：借出资产账户（loan）+ 收款现金账户（cash），现金留足余额以通过建仓扣款守卫
async function makeLendAccounts() {
  const [asset] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "借出资产户", type: "loan",
    openingBalanceCents: 0, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  const [cash] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "收款现金户", type: "cash",
    openingBalanceCents: 100000000, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  return { asset, cash };
}

async function createLend(assetId: string, cashId: string, costYuan: string) {
  const r = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    {
      type: "loan", name: "借出测试", code: "",
      accountId: assetId, paymentAccountId: cashId,
      quantity: 0, costYuan, feeYuan: "0", valueYuan: costYuan,
      purchaseDate: "2026-06-15", maturityDate: null, interestRate: null,
      tagIds: [] as string[], projectId: null, direction: "lend",
    },
  );
  assert.strictEqual(r.ok, true, `建仓应成功: ${JSON.stringify(r)}`);
  const [h] = await db
    .select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.accountId, assetId), eq(investmentHoldings.ledgerId, seed.l1.id)))
    .limit(1);
  return h.id as string;
}

const bal = async (id: string) =>
  (await listAccountsWithBalance(seed.l1.id)).find((a: any) => a.id === id).balanceCents as number;

const hold = async (hid: string) =>
  (await db.select().from(investmentHoldings).where(eq(investmentHoldings.id, hid)).limit(1))[0];

const txsOf = async (hid: string) =>
  await db.select().from(transactions).where(eq(transactions.investmentHoldingId, hid));

test("借出全额收款（仅本金）：资产回笼清零，持仓 → 已结清", async () => {
  const { asset, cash } = await makeLendAccounts();
  const hid = await createLend(asset.id, cash.id, "1000"); // 借出 1000 元

  // 建仓后：现金 -100000，借出资产 +100000
  assert.strictEqual(await bal(cash.id), 100000000 - 100000, "建仓后现金应 -1000");
  assert.strictEqual(await bal(asset.id), 100000, "建仓后借出资产 +1000");

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "1000", principalYuan: "1000", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `收款应成功: ${JSON.stringify(u)}`);

  // 收款本金转账：借出资产 -100000，现金 +100000 → 均回原位
  assert.strictEqual(await bal(cash.id), 100000000, "收款后现金应回初始");
  assert.strictEqual(await bal(asset.id), 0, "收款后借出资产应回 0");

  const h = await hold(hid);
  assert.strictEqual(h.status, "matured", "应已结清");
  assert.strictEqual(h.costCents, 0, "成本应清零");

  const txs = await txsOf(hid);
  const collectTxs = txs.filter((t: any) => t.type === TX.transfer && t.accountId === asset.id);
  assert.strictEqual(collectTxs.length, 1, "应有一笔收款本金转账（借出资产→现金）");
  assert.strictEqual(collectTxs[0].amountCents, 100000, "收款本金转账应为 1000");
  assert.strictEqual(txs.filter((t: any) => t.type === TX.income).length, 0, "不应有收入流水（无利息）");
  assert.strictEqual(txs.filter((t: any) => t.type === TX.expense).length, 0, "不应有支出流水");
});

test("借出部分收款：收回本金 < 剩余借出本金，资产按收回额减少，持仓保持 active", async () => {
  const { asset, cash } = await makeLendAccounts();
  const hid = await createLend(asset.id, cash.id, "1000"); // 借出 1000

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "400", principalYuan: "400", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `部分收款应成功: ${JSON.stringify(u)}`);

  const h = await hold(hid);
  assert.strictEqual(h.status, "active", "部分收款应保持 active");
  assert.strictEqual(h.costCents, 60000, "剩余借出本金应为 600（1000-400）");

  // 现金：-100000（借出） +40000（收回）= -60000；借出资产：+100000 -40000 = +60000
  assert.strictEqual(await bal(cash.id), 100000000 - 60000, "现金应净 -600");
  assert.strictEqual(await bal(asset.id), 60000, "借出资产应剩 600");

  const txs = await txsOf(hid);
  const collectTxs = txs.filter((t: any) => t.type === TX.transfer && t.accountId === asset.id);
  assert.strictEqual(collectTxs.length, 1, "应有一笔收款本金转账（借出资产→现金）");
  assert.strictEqual(collectTxs[0].amountCents, 40000, "收款本金转账应为 400");
});

test("借出收款含利息：利息记为现金收入（非亏损支出），且回笼资产", async () => {
  const { asset, cash } = await makeLendAccounts();
  const hid = await createLend(asset.id, cash.id, "1000"); // 借出 1000

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "1050", principalYuan: "1000", interestYuan: "50", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `收款应成功: ${JSON.stringify(u)}`);

  // 现金：-100000（借出） +100000（本金） +5000（利息）= 100005000；借出资产：回 0
  assert.strictEqual(await bal(cash.id), 100000000 + 5000, "现金应净 +500（利息增加净资产）");
  assert.strictEqual(await bal(asset.id), 0, "借出资产应清零");

  const txs = await txsOf(hid);
  // 关键断言：利息应记为收入（income），绝不能是亏损支出（expense）
  const incomes = txs.filter((t: any) => t.type === TX.income);
  const expenses = txs.filter((t: any) => t.type === TX.expense);
  assert.strictEqual(expenses.length, 0, "利息绝不能再误记为亏损支出");
  assert.strictEqual(incomes.length, 1, "应有一笔利息收入");
  assert.strictEqual(incomes[0].amountCents, 5000, "利息收入应为 5000");

  const h = await hold(hid);
  assert.strictEqual(h.status, "matured", "本金收回应已结清");
});

test("借出超额收款：收回本金 > 剩余借出本金 → 拦截，持仓/流水不变", async () => {
  const { asset, cash } = await makeLendAccounts();
  const hid = await createLend(asset.id, cash.id, "500"); // 借出 500

  const before = await txsOf(hid);
  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "600", principalYuan: "600", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, false, "超额收款应被拦截");
  assert.strictEqual(u.error, "investment.collectPrincipalExceed");

  const after = await txsOf(hid);
  assert.strictEqual(after.length, before.length, "不应新增流水");
  const h = await hold(hid);
  assert.strictEqual(h.status, "active", "持仓不应变化");
  assert.strictEqual(h.costCents, 50000, "成本不应被改写");
});
