/**
 * ratcount · 借入还款修正：利息记为支出（非收入）+ 支持部分还款
 * - 全额本金结清：本金转账冲减负债，持仓 → 已结清（matured）
 * - 部分还款：归还本金 < 剩余借入本金，负债按归还额减少，持仓保持 active
 * - 利息：记为现金支出（TX.expense），不再误记为收入
 * - 超额还款：归还本金 > 剩余借入本金 → 拦截 errors.investment.repayPrincipalExceed
 * 运行：npx tsx --test test/investment-borrow-repay.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, count, and } from "drizzle-orm";

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

// 借入场景：负债账户（borrowed）+ 收款现金账户（cash），期初均 0，便于精确核对差额
async function makeBorrowAccounts() {
  const [liab] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "借入负债户", type: "borrowed",
    openingBalanceCents: 0, isAsset: false, createdBy: seed.u1.id,
  }).returning();
  const [cash] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "还款现金户", type: "cash",
    openingBalanceCents: 0, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  return { liab, cash };
}

async function createBorrow(liabId: string, cashId: string, costYuan: string) {
  const r = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    {
      type: "loan", name: "借入测试", code: "",
      accountId: liabId, paymentAccountId: cashId,
      quantity: 0, costYuan, feeYuan: "0", valueYuan: costYuan,
      purchaseDate: "2026-06-15", maturityDate: null, interestRate: null,
      tagIds: [] as string[], projectId: null, direction: "borrow",
    },
  );
  assert.strictEqual(r.ok, true, `建仓应成功: ${JSON.stringify(r)}`);
  const [h] = await db
    .select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.accountId, liabId), eq(investmentHoldings.ledgerId, seed.l1.id)))
    .limit(1);
  return h.id as string;
}

const bal = async (id: string) =>
  (await listAccountsWithBalance(seed.l1.id)).find((a: any) => a.id === id).balanceCents as number;

const hold = async (hid: string) =>
  (await db.select().from(investmentHoldings).where(eq(investmentHoldings.id, hid)).limit(1))[0];

const txsOf = async (hid: string) =>
  await db.select().from(transactions).where(eq(transactions.investmentHoldingId, hid));

test("借入全额还款（仅本金）：负债清零，持仓 → 已结清", async () => {
  const { liab, cash } = await makeBorrowAccounts();
  const hid = await createBorrow(liab.id, cash.id, "1000"); // 借入 1000 元

  // 建仓后：现金 +100000，负债 -100000
  assert.strictEqual(await bal(cash.id), 100000, "建仓后现金应 +1000");
  assert.strictEqual(await bal(liab.id), -100000, "建仓后负债 -1000");

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "1000", principalYuan: "1000", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `还款应成功: ${JSON.stringify(u)}`);

  // 还款本金转账：现金 -100000，负债 +100000 → 均回 0
  assert.strictEqual(await bal(cash.id), 0, "还款后现金应回 0");
  assert.strictEqual(await bal(liab.id), 0, "还款后负债应回 0");

  const h = await hold(hid);
  assert.strictEqual(h.status, "matured", "应已结清");
  assert.strictEqual(h.costCents, 0, "成本应清零");

  const txs = await txsOf(hid);
  // 含建仓转账（借入→现金）+ 还款转账（现金→借入负债）；还款转账恰为一笔，无利息/收入
  const repayTxs = txs.filter((t: any) => t.type === TX.transfer && t.toAccountId === liab.id);
  assert.strictEqual(repayTxs.length, 1, "应有一笔还款本金转账（现金→借入负债）");
  assert.strictEqual(repayTxs[0].amountCents, 100000, "还款本金转账应为 1000");
  assert.strictEqual(txs.filter((t: any) => t.type === TX.income).length, 0, "不应有收入流水");
  assert.strictEqual(txs.filter((t: any) => t.type === TX.expense).length, 0, "不应有支出流水（无利息）");
});

test("借入部分还款：归还本金 < 剩余借入本金，负债按归还额减少，持仓保持 active", async () => {
  const { liab, cash } = await makeBorrowAccounts();
  const hid = await createBorrow(liab.id, cash.id, "1000"); // 借入 1000

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "400", principalYuan: "400", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `部分还款应成功: ${JSON.stringify(u)}`);

  const h = await hold(hid);
  assert.strictEqual(h.status, "active", "部分还款应保持 active");
  assert.strictEqual(h.costCents, 60000, "剩余负债应为 600（1000-400）");

  // 现金：+100000（借入） -40000（还款）= +60000；负债：-100000 +40000 = -60000
  assert.strictEqual(await bal(cash.id), 60000, "现金应剩 600");
  assert.strictEqual(await bal(liab.id), -60000, "负债应剩 600");

  const txs = await txsOf(hid);
  const repayTxs = txs.filter((t: any) => t.type === TX.transfer && t.toAccountId === liab.id);
  assert.strictEqual(repayTxs.length, 1, "应有一笔还款本金转账（现金→借入负债）");
  assert.strictEqual(repayTxs[0].amountCents, 40000, "还款本金转账应为 400");
  assert.strictEqual(txs.filter((t: any) => t.type === TX.expense).length, 0, "部分还款无利息不应有支出");
});

test("借入还款含利息：利息记为现金支出（非收入），且不增加负债", async () => {
  const { liab, cash } = await makeBorrowAccounts();
  const hid = await createBorrow(liab.id, cash.id, "1000"); // 借入 1000

  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "1050", principalYuan: "1000", interestYuan: "50", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, true, `还款应成功: ${JSON.stringify(u)}`);

  // 现金：+100000（借入） -100000（本金） -5000（利息）= -5000；负债：回 0
  assert.strictEqual(await bal(cash.id), -5000, "现金应净 -500（利息支出）");
  assert.strictEqual(await bal(liab.id), 0, "负债应清零");

  const txs = await txsOf(hid);
  // 关键断言：利息应记为支出（expense），绝不能是收入（income）
  const expenses = txs.filter((t: any) => t.type === TX.expense);
  const incomes = txs.filter((t: any) => t.type === TX.income);
  assert.strictEqual(incomes.length, 0, "利息绝不能再误记为收入");
  assert.strictEqual(expenses.length, 1, "应有一笔利息支出");
  assert.strictEqual(expenses[0].amountCents, 5000, "利息支出应为 5000");

  const h = await hold(hid);
  assert.strictEqual(h.status, "matured", "本金还清应已结清");
});

test("借入超额还款：归还本金 > 剩余借入本金 → 拦截，持仓/流水不变", async () => {
  const { liab, cash } = await makeBorrowAccounts();
  const hid = await createBorrow(liab.id, cash.id, "500"); // 借入 500

  const before = await txsOf(hid);
  const u = await sellInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id,
    { id: hid, amountYuan: "600", principalYuan: "600", interestYuan: "0", feeYuan: "0", accountId: cash.id, txDate: "2026-07-01", tagIds: [] },
  );
  assert.strictEqual(u.ok, false, "超额还款应被拦截");
  assert.strictEqual(u.error, "investment.repayPrincipalExceed");

  const after = await txsOf(hid);
  assert.strictEqual(after.length, before.length, "不应新增流水");
  const h = await hold(hid);
  assert.strictEqual(h.status, "active", "持仓不应变化");
  assert.strictEqual(h.costCents, 50000, "成本不应被改写");
});
