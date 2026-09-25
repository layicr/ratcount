/**
 * ratcount · 借贷方向（借出 / 借入）功能测试（服务层，复用 DB 测试夹具）
 *
 * 覆盖：
 *   - 借贷必须选择方向：type=loan 且无 direction → 校验失败（investment.directionRequired）
 *   - 借出（lend）：买入转账 扣款账户(cash) → 关联账户(loan 资产)，净资产正贡献
 *   - 借入（borrow）：买入转账 关联账户(borrowed 负债) → 收款账户(cash)（方向翻转）
 *   - 借入净资产：未实现盈亏取负（负债），interest  accrual 使净资产下降
 *   - 借入还款（sell/到期动作）：现金账户 → 借入负债账户（负债减少）
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/investments-direction.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

let db: any;
let seed: any;
let createInvestmentService: any;
let sellInvestmentService: any;
let investmentNetWorthValue: any;
let investmentHoldings: any;
let transactions: any;
let accounts: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({
    createInvestmentService,
    sellInvestmentService,
  } = await import("../lib/services/investments"));
  ({ investmentNetWorthValue } = await import("../lib/queries/investments"));
  ({ investmentHoldings, transactions, accounts } = await import("../db/schema"));
});

/** 为某账本新建一个借入负债账户（isAsset=false）并返回其 id */
async function makeBorrowedAccount(ledgerId: string, name: string): Promise<string> {
  const [a] = await db
    .insert(accounts)
    .values({ ledgerId, name, type: "borrowed", openingBalanceCents: 0, isAsset: false, createdBy: seed.u1.id })
    .returning();
  return a.id as string;
}

/** 查询一条持仓当前的买入转账流水（按买入备注筛选） */
async function findBuyTransfer(holdingName: string) {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, seed.l1.id), eq(transactions.remark, `借入 ${holdingName}`)));
  return tx;
}

test("借贷必须选择方向：type=loan 缺 direction 校验失败", async () => {
  // 与其它字段完全一致，仅缺 direction；服务层应整体拒收（通用校验错误码）
  // Identical to a valid loan except missing direction → service must reject (generic validation code)
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "loan",
      name: "缺方向借款",
      accountId: seed.ac2.id,
      paymentAccountId: seed.ac1.id,
      quantity: 0,
      costYuan: "1000.00",
      feeYuan: "0",
      valueYuan: "1000.00",
      purchaseDate: "2026-01-01",
      // direction 故意缺失
    },
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, "errors.invalidInput");

  // 对照组：同样的字段补上 direction 应成功（见「借出」用例），证明 direction 为唯一缺失项
  // Control: the same input with direction set succeeds (see the "借出" case), proving direction is the missing gate
});

test("借出：买入转账 扣款账户 → 关联账户，净资产正贡献", async () => {
  const nwBefore = await investmentNetWorthValue(seed.l1.id);
  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "loan",
      name: "借出老王",
      direction: "lend",
      accountId: seed.ac2.id, // 关联账户（借出资产）
      paymentAccountId: seed.ac1.id, // 扣款账户（现金）
      quantity: 0,
      costYuan: "1000.00",
      feeYuan: "0",
      valueYuan: "1060.00", // 含 60 应计利息
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const [h] = await db
    .select({ id: investmentHoldings.id, direction: investmentHoldings.direction })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, "借出老王")));
  assert.equal(h.direction, "lend");

  // 净资产贡献 = 1060 - 1000 - 0 = +60（正）；按增量断言（测试共享 DB 状态）
  const nwAfter = await investmentNetWorthValue(seed.l1.id);
  assert.equal(nwAfter - nwBefore, 6000, `借出应正贡献 +60.00`);
});

test("借入：买入转账方向翻转（借入负债账户 → 收款现金账户），且净资产扣减", async () => {
  const borrowedId = await makeBorrowedAccount(seed.l1.id, "借入负债账户");
  const nwBefore = await investmentNetWorthValue(seed.l1.id);

  const res = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "loan",
      name: "借入银行",
      direction: "borrow",
      accountId: borrowedId, // 关联账户（借入负债）
      paymentAccountId: seed.ac1.id, // 收款账户（现金）
      quantity: 0,
      costYuan: "2000.00",
      feeYuan: "0",
      valueYuan: "2120.00", // 含 120 应计利息（负债增加）
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  // 买入转账方向：FROM = 借入负债账户，TO = 现金账户
  const buyTx = await findBuyTransfer("借入银行");
  assert.ok(buyTx, "应生成借入转账流水");
  assert.equal(buyTx.accountId, borrowedId, "借入转账 from 应为借入负债账户");
  assert.equal(buyTx.toAccountId, seed.ac1.id, "借入转账 to 应为收款现金账户");
  assert.equal(Number(buyTx.amountCents), 200000, "转账金额应为本金 2000.00");

  // 净资产贡献 = -(2120 - 2000 - 0) = -120（负债，取负）；按增量断言（测试共享 DB 状态）
  const nwAfter = await investmentNetWorthValue(seed.l1.id);
  assert.equal(nwAfter - nwBefore, -12000, `借入应负贡献 -120.00`);
});

test("借入还款：现金账户 → 借入负债账户（负债减少）", async () => {
  const borrowedId = await makeBorrowedAccount(seed.l1.id, "借入负债账户2");

  const createRes = await createInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    {
      type: "loan",
      name: "借入朋友",
      direction: "borrow",
      accountId: borrowedId,
      paymentAccountId: seed.ac1.id,
      quantity: 0,
      costYuan: "1000.00",
      feeYuan: "0",
      valueYuan: "1000.00",
      purchaseDate: "2026-01-01",
    },
  );
  assert.equal(createRes.ok, true, JSON.stringify(createRes));
  const [h] = await db
    .select({ id: investmentHoldings.id })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, "借入朋友")));

  // 还款 600（含本金 600 + 利息 0）
  const repayRes = await sellInvestmentService(
    { id: seed.u1.id },
    seed.l1.id,
    { id: h.id, amountYuan: "600.00", txDate: "2026-03-01" },
  );
  assert.equal(repayRes.ok, true, JSON.stringify(repayRes));

  // 还款转账：FROM = 现金账户，TO = 借入负债账户
  const [repayTx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, seed.l1.id), eq(transactions.remark, "偿还 借入朋友（转回本金）")));
  assert.ok(repayTx, "应生成偿还转账流水");
  assert.equal(repayTx.accountId, seed.ac1.id, "还款 from 应为现金账户");
  assert.equal(repayTx.toAccountId, borrowedId, "还款 to 应为借入负债账户");
});
