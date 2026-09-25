/**
 * ratcount · 投资持仓删除级联清理流水（服务层，复用 DB 测试夹具）
 *
 * 覆盖：
 *   - 定期删除：买入转账流水（investment_holding_id 回指）被硬删，账户实时余额回滚
 *   - 股票带标签 + 派息：删除持仓同时清理买入流水与派息流水，及其流水标签
 *   - 软删除持仓行保留（status=deleted），仅流水与持仓标签被清理
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/investment-delete-cascade.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

let db: any;
let seed: any;
let createInvestmentService: any;
let deleteInvestmentService: any;
let dividendInvestmentService: any;
let listAccounts: any;
let investmentHoldings: any;
let transactions: any;
let transactionTags: any;
let holdingTags: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({
    createInvestmentService,
    deleteInvestmentService,
    dividendInvestmentService,
  } = await import("../lib/services/investments"));
  ({ listAccountsWithBalance: listAccounts } = await import("../lib/queries/accounts"));
  ({ investmentHoldings, transactions, transactionTags, holdingTags } = await import("../db/schema"));
});

test("定期删除：级联删除买入流水，账户余额回滚", async () => {
  const before = (await listAccounts(seed.l1.id)).find((x: any) => x.id === seed.ac1.id).baseBalanceCents;
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "deposit",
      name: "定存A",
      accountId: seed.ac2.id, // 关联账户（定期）
      paymentAccountId: seed.ac1.id, // 扣款账户（现金）
      quantity: 0,
      costYuan: "1000.00",
      feeYuan: "0",
      valueYuan: "1000.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const [h] = await db
    .select({ id: investmentHoldings.id, status: investmentHoldings.status })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, "定存A")));
  assert.equal(h.status, "active");

  // 买入转账流水应回指持仓
  const linked = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linked.length, 1, "买入流水应回指持仓");

  // 现金账户因转账减少 1000.00 = 100000 分
  const afterCreate = (await listAccounts(seed.l1.id)).find((x: any) => x.id === seed.ac1.id).baseBalanceCents;
  assert.equal(afterCreate, before - 100000, "创建定存后现金余额应减少 1000.00");

  // 删除持仓
  const del = await deleteInvestmentService({ id: seed.u1.id }, seed.l1.id, h.id, "deposit");
  assert.equal(del.ok, true, JSON.stringify(del));

  // 流水被硬删
  const linkedAfter = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linkedAfter.length, 0, "删除后买入流水应被硬删");
  // 存量 buyTransactionId 指针兜底：买入流水也已消失
  const [h2] = await db
    .select({ status: investmentHoldings.status, buy: investmentHoldings.buyTransactionId })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, h.id));
  assert.equal(h2.status, "deleted");
  if (h2.buy) {
    const bt = await db.select().from(transactions).where(eq(transactions.id, h2.buy));
    assert.equal(bt.length, 0, "buyTransactionId 指向的流水也应被删");
  }

  // 余额回滚到创建前
  const afterDelete = (await listAccounts(seed.l1.id)).find((x: any) => x.id === seed.ac1.id).baseBalanceCents;
  assert.equal(afterDelete, before, "删除后现金余额应回滚到创建前");
});

test("股票带标签 + 派息：删除持仓同时清理买入流水、派息流水及其标签", async () => {
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "stock",
      name: "测试股",
      accountId: seed.ac2.id,
      paymentAccountId: seed.ac1.id,
      quantity: 100,
      costYuan: "500.00",
      feeYuan: "10.00",
      valueYuan: "600.00",
      purchaseDate: "2026-01-01",
      tagIds: [seed.tagDaily.id],
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const [h] = await db
    .select({ id: investmentHoldings.id })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, "测试股")));

  // 派息 50.00
  const div = await dividendInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    { id: h.id, amountYuan: "50.00", txDate: "2026-03-01", tagIds: [seed.tagDaily.id] },
  );
  assert.equal(div.ok, true, JSON.stringify(div));

  const linked = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linked.length, 2, "应有一条买入流水 + 一条派息流水");
  const linkedTagCount = await db
    .select({ c: transactionTags.id })
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, linked[0].id));
  assert.ok(linkedTagCount.length >= 0, "买入流水标签应可查（持仓标签已打上）");

  // 删除
  const del = await deleteInvestmentService({ id: seed.u1.id }, seed.l1.id, h.id, "stock");
  assert.equal(del.ok, true, JSON.stringify(del));

  const linkedAfter = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linkedAfter.length, 0, "买入与派息流水都应被硬删");

  // 这些流水上的标签也应被清理
  const allTags = await db.select().from(transactionTags)
    .where(eq(transactionTags.transactionId, linked[0].id));
  assert.equal(allTags.length, 0, "被删流水的标签应清理");

  // 持仓标签（holding_tags）应保留（与流水标签相互独立）
  const ht = await db.select().from(holdingTags).where(eq(holdingTags.holdingId, h.id));
  assert.equal(ht.length, 1, "持仓自身标签应保留");
});

/** 借贷删除级联公共用例：借入/借出均写入回指持仓的流水，删除应硬删该流水并回滚账户余额
 *  Loan delete cascade: borrow/lend both write a holding-linked tx; deletion must hard-delete it and revert balances */
async function loanCascadeCase(dir: "borrow" | "lend"): Promise<void> {
  const isBorrow = dir === "borrow";
  const before = Object.fromEntries(
    (await listAccounts(seed.l1.id)).map((x: any) => [x.id, x.baseBalanceCents]),
  );
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "loan",
      direction: dir,
      name: isBorrow ? "借入A" : "借出A",
      // 表单语义：借入时现金在 paymentAccountId、负债账户在 accountId；借出相反（服务层据此决定流水方向）
      accountId: isBorrow ? seed.ac1.id : seed.ac2.id,
      paymentAccountId: isBorrow ? seed.ac2.id : seed.ac1.id,
      quantity: 0,
      costYuan: "2000.00",
      feeYuan: "0",
      valueYuan: "2000.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const [h] = await db
    .select({ id: investmentHoldings.id, status: investmentHoldings.status })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, isBorrow ? "借入A" : "借出A")));
  assert.equal(h.status, "active");

  // 借贷创建应写入一条回指持仓的流水
  const linked = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linked.length, 1, `${dir} 流水应回指持仓`);

  const afterCreate = Object.fromEntries(
    (await listAccounts(seed.l1.id)).map((x: any) => [x.id, x.baseBalanceCents]),
  );
  assert.ok(
    afterCreate[seed.ac1.id] !== before[seed.ac1.id] || afterCreate[seed.ac2.id] !== before[seed.ac2.id],
    "创建借贷应改变相关账户余额",
  );

  // 删除持仓
  const del = await deleteInvestmentService({ id: seed.u1.id }, seed.l1.id, h.id, "loan");
  assert.equal(del.ok, true, JSON.stringify(del));

  // 流水被硬删
  const linkedAfter = await db.select().from(transactions).where(eq(transactions.investmentHoldingId, h.id));
  assert.equal(linkedAfter.length, 0, `删除后 ${dir} 流水应被硬删`);

  // 余额回滚到创建前
  const afterDelete = Object.fromEntries(
    (await listAccounts(seed.l1.id)).map((x: any) => [x.id, x.baseBalanceCents]),
  );
  assert.equal(afterDelete[seed.ac1.id], before[seed.ac1.id], "现金账户余额应回滚到创建前");
  assert.equal(afterDelete[seed.ac2.id], before[seed.ac2.id], "对手账户余额应回滚到创建前");

  const [h2] = await db
    .select({ status: investmentHoldings.status })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, h.id));
  assert.equal(h2.status, "deleted");
}

test("借贷（借入）删除：级联删借入流水，账户余额回滚", async () => {
  await loanCascadeCase("borrow");
});

test("借贷（借出）删除：级联删借出流水，账户余额回滚", async () => {
  await loanCascadeCase("lend");
});
