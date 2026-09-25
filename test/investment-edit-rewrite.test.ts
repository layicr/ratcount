/**
 * ratcount · 投资持仓「编辑回写买入流水」功能测试（服务层，复用 DB 测试夹具）
 *
 * 覆盖（updateInvestmentService 内 reconcileBuyFlow，按 buy_transaction_id 指针定位）：
 *   - 编辑改成本/费用：按指针改写买入流水金额（不重复），且改写的是持有指针指向的那条
 *   - 编辑使扣款账户=关联账户：不再满足买入条件 → 删除旧买入流水（余额回滚），并把持仓指针置空
 *   - 编辑改账户（仍不同）：买入流水 from/to 同步更新
 *   - 旧持仓（buy_transaction_id 为空，功能上线前）：编辑为不同账户也不生成买入流水（保持现状，不解决历史不一致）
 *   - 编辑携带 tagIds：买入流水标签整体替换为持仓标签
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/investment-edit-rewrite.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";
import { accounts } from "../db/schema";

let db: any;
let seed: any;
let payer: any;
let createInvestmentService: any;
let updateInvestmentService: any;
let investmentHoldings: any;
let transactions: any;
let transactionTags: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({ createInvestmentService, updateInvestmentService } = await import("../lib/services/investments"));
  ({ investmentHoldings, transactions, transactionTags } = await import("../db/schema"));
  const [payerAcct] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "付款账户", type: "cash",
    openingBalanceCents: 1_000_000, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  payer = payerAcct.id as string;
});

/** 通过 create 服务新建一条「带买入流水」的持仓，返回持仓 id（买入流水 from=ac1→to=ac2，buy_transaction_id 已写回） */
async function createHolding(name: string, input: Record<string, unknown> = {}) {
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "stock",
      name,
      accountId: seed.ac2.id, // 关联账户
      paymentAccountId: payer, // 扣款账户（充足余额，与关联账户不同 → 生成买入流水）
      quantity: 100,
      costYuan: "500.00",
      feeYuan: "10.00",
      valueYuan: "600.00",
      purchaseDate: "2026-01-01",
      ...input,
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  const [h] = await db
    .select({ id: investmentHoldings.id, buyTransactionId: investmentHoldings.buyTransactionId })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, name)));
  return { id: h.id as string, buyTransactionId: h.buyTransactionId as string | null };
}

/** 统计某备注的买入流水 */
async function countBuys(remark: string) {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, seed.l1.id), eq(transactions.remark, remark)));
}

test("编辑改成本/费用：按指针改写买入流水金额（不重复），且命中持有指针", async () => {
  const name = "回写-改金额";
  const { id, buyTransactionId } = await createHolding(name);
  assert.ok(buyTransactionId, "前置：新持仓应已写回买入流水指针");

  const res = await updateInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    id,
    {
      type: "stock", name,
      accountId: seed.ac2.id, paymentAccountId: payer,
      quantity: 100, costYuan: "800.00", feeYuan: "20.00", valueYuan: "900.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const buys = await countBuys(`买入 ${name}`);
  assert.equal(buys.length, 1, "买入流水应恰好一条（更新而非新增）");
  assert.equal(buys[0].amountCents, 82000, "金额应更新为 成本+费用 = 82000");
  assert.equal(buys[0].id, buyTransactionId, "应改写持仓指针指向的那条买入流水");
});

test("编辑使扣款账户=关联账户：删除旧买入流水（余额回滚）并置空指针", async () => {
  const name = "回写-同账户";
  const { id, buyTransactionId } = await createHolding(name);
  assert.ok(buyTransactionId, "前置：应已写回买入流水指针");
  assert.equal((await countBuys(`买入 ${name}`)).length, 1, "前置：应已生成买入流水");

  const res = await updateInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    id,
    {
      type: "stock", name,
      // 扣款账户改与关联账户相同 → 不再满足买入条件
      accountId: seed.ac2.id, paymentAccountId: seed.ac2.id,
      quantity: 100, costYuan: "500.00", feeYuan: "10.00", valueYuan: "600.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  assert.equal((await countBuys(`买入 ${name}`)).length, 0, "旧买入流水应被删除");
  const [h] = await db
    .select({ buyTransactionId: investmentHoldings.buyTransactionId })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, id));
  assert.equal(h.buyTransactionId, null, "删除买入流水后应把持仓指针置空");
});

test("编辑改账户（仍不同）：买入流水 from/to 同步更新", async () => {
  const name = "回写-改账户";
  const { id, buyTransactionId } = await createHolding(name);
  assert.ok(buyTransactionId, "前置：应已写回买入流水指针");

  const res = await updateInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    id,
    {
      type: "stock", name,
      // 交换扣款/关联账户（仍不同 → 仍满足买入条件）
      accountId: seed.ac1.id, paymentAccountId: seed.ac2.id,
      quantity: 100, costYuan: "500.00", feeYuan: "10.00", valueYuan: "600.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const buys = await countBuys(`买入 ${name}`);
  assert.equal(buys.length, 1, "买入流水应恰好一条");
  assert.equal(buys[0].id, buyTransactionId, "仍应改写同一条买入流水");
  assert.equal(buys[0].accountId, seed.ac2.id, "from 应为新扣款账户");
  assert.equal(buys[0].toAccountId, seed.ac1.id, "to 应为新关联账户");
  assert.equal(buys[0].amountCents, 51000);
});

test("旧持仓（buy_transaction_id 为空）编辑为不同账户：不生成买入流水（保持现状）", async () => {
  const name = "回写-旧持仓不动";
  // 直接插入「同账户」旧持仓（buy_transaction_id 为空，模拟本功能上线前的数据）
  const [h] = await db
    .insert(investmentHoldings)
    .values({
      ledgerId: seed.l1.id, createdBy: seed.u1.id,
      type: "stock", name,
      accountId: seed.ac1.id, paymentAccountId: seed.ac1.id,
      quantity: 100, costCents: 30000, feeCents: 0, currentValueCents: 30000,
      purchaseDate: "2026-02-01", status: "active", dividendCents: 0,
    })
    .returning({ id: investmentHoldings.id });
  assert.equal((await countBuys(`买入 ${name}`)).length, 0, "前置：旧持仓无买入流水");

  const res = await updateInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    h.id,
    {
      type: "stock", name,
      // 改为不同账户 → 若为新持仓会生成买入流水；旧持仓（无指针）应保持不动
      accountId: seed.ac1.id, paymentAccountId: seed.ac2.id,
      quantity: 100, costYuan: "300.00", feeYuan: "0.00", valueYuan: "300.00",
      purchaseDate: "2026-02-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const buys = await countBuys(`买入 ${name}`);
  assert.equal(buys.length, 0, "旧持仓不应生成买入流水（保持现状，不解决历史不一致）");
  const [updated] = await db
    .select({ buyTransactionId: investmentHoldings.buyTransactionId })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, h.id));
  assert.equal(updated.buyTransactionId, null, "旧持仓指针应保持为空");
});

test("编辑携带 tagIds：买入流水标签整体替换为持仓标签", async () => {
  const name = "回写-标签同步";
  const { id, buyTransactionId } = await createHolding(name, { tagIds: [seed.tagDaily.id] });
  assert.ok(buyTransactionId, "前置：应已写回买入流水指针");
  // 前置：买入流水应带 tagDaily
  let buys = await countBuys(`买入 ${name}`);
  assert.equal(buys.length, 1);
  let tags = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, buys[0].id));
  assert.equal(tags.length, 1, "前置：买入流水应带 1 个标签");

  const res = await updateInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    id,
    {
      type: "stock", name,
      accountId: seed.ac2.id, paymentAccountId: payer,
      quantity: 100, costYuan: "500.00", feeYuan: "10.00", valueYuan: "600.00",
      purchaseDate: "2026-01-01",
      tagIds: [], // 清空标签
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  buys = await countBuys(`买入 ${name}`);
  assert.equal(buys.length, 1);
  assert.equal(buys[0].id, buyTransactionId, "应改写同一条买入流水");
  tags = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, buys[0].id));
  assert.equal(tags.length, 0, "买入流水标签应被清空（与持仓一致）");
});
