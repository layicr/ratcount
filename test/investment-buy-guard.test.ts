/**
 * ratcount · 买入持仓余额守卫：扣款账户余额 < 成本+费用 时拦截（不建持仓、不写买入流水）
 * createInvestmentService: block cross-account non-borrow buy when payer balance < cost+fee, return errors.insufficientBalance
 * 运行：npx tsx --test test/investment-buy-guard.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, count, and } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";
import { accounts, investmentHoldings, transactions } from "../db/schema";

let db: any;
let seed: any;
let listAccountsWithBalance: any;
let createInvestmentService: any;
let updateInvestmentService: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ listAccountsWithBalance } = await import("../lib/queries"));
  ({ createInvestmentService, updateInvestmentService } = await import("../lib/services/investments"));
  seed = await seedTestData(db);
});

async function makeFundAcct() {
  const [a] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "基金账户", type: "fund",
    openingBalanceCents: 0, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  return a;
}

async function makePayerAcct(openingCents: number) {
  const [a] = await db.insert(accounts).values({
    ledgerId: seed.l1.id, name: "付款账户", type: "cash",
    openingBalanceCents: openingCents, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  return a;
}

async function holdingIdFor(accountId: string) {
  const [h] = await db
    .select({ id: investmentHoldings.id })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.accountId, accountId), eq(investmentHoldings.ledgerId, seed.l1.id)))
    .limit(1);
  return h.id as string;
}

async function counts() {
  const [h] = await db.select({ c: count() }).from(investmentHoldings).where(eq(investmentHoldings.ledgerId, seed.l1.id));
  const [t] = await db.select({ c: count() }).from(transactions).where(eq(transactions.ledgerId, seed.l1.id));
  return { holdings: Number(h.c), txs: Number(t.c) };
}

const baseInput = (paymentAccountId: string, costYuan: string) => ({
  type: "fund" as const, name: "测试基金", code: "F001",
  accountId: "" as string, paymentAccountId,
  quantity: 10000, costYuan, feeYuan: "0", valueYuan: costYuan,
  purchaseDate: "2026-06-15", tagIds: [] as string[], projectId: null, direction: null,
});

test("余额不足：跨账户买入 扣款账户余额<成本 → 拦截、不建持仓、不写买入流水", async () => {
  const fundAcct = await makeFundAcct();
  // 现金 ac1 在 seed 后余额 = 10000 - 4800 - 1500 - 20000 = -16300（已为负）
  const accts = await listAccountsWithBalance(seed.l1.id);
  const ac1 = accts.find((a: any) => a.id === seed.ac1.id);
  assert.ok(ac1.balanceCents < 0, "前置：ac1 应为负，便于构造不足场景");

  const before = await counts();
  const r = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, { ...baseInput(seed.ac1.id, "100"), accountId: fundAcct.id },
  );
  assert.strictEqual(r.ok, false, "应被拦截");
  assert.strictEqual(r.error, "errors.insufficientBalance");

  const after = await counts();
  assert.strictEqual(after.holdings, before.holdings, "不应新建持仓");
  assert.strictEqual(after.txs, before.txs, "不应写入买入流水");
});

test("余额充足：跨账户买入 扣款账户余额≥成本 → 正常建持仓并写买入流水", async () => {
  const fundAcct = await makeFundAcct();
  // 借记卡 ac2 在 seed 后余额 = 500000 + 800000 + 20000 = 1320000
  const accts = await listAccountsWithBalance(seed.l1.id);
  const ac2 = accts.find((a: any) => a.id === seed.ac2.id);
  assert.ok(ac2.balanceCents >= 5000, "前置：ac2 余额应足够");

  const before = await counts();
  const r = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, { ...baseInput(seed.ac2.id, "50"), accountId: fundAcct.id },
  );
  assert.strictEqual(r.ok, true, `应成功: ${JSON.stringify(r)}`);

  const after = await counts();
  assert.strictEqual(after.holdings, before.holdings + 1, "应新增一条持仓");
  assert.strictEqual(after.txs, before.txs + 1, "应新增一条买入流水");
  const accts2 = await listAccountsWithBalance(seed.l1.id);
  const ac2After = accts2.find((a: any) => a.id === seed.ac2.id);
  assert.strictEqual(ac2After.balanceCents, ac2.balanceCents - 5000, "扣款账户应扣减 5000");
});

test("编辑买入：调高成本但在（余额+旧买入释放额）内 → 正常更新并扣减", async () => {
  const fundAcct = await makeFundAcct();
  const payer = await makePayerAcct(200000); // 期初 2000 元
  // 建仓：成本 1000 元 → 扣款账户余额 100000
  const c = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, { ...baseInput(payer.id, "1000"), accountId: fundAcct.id },
  );
  assert.strictEqual(c.ok, true, `建仓应成功: ${JSON.stringify(c)}`);
  const hid = await holdingIdFor(fundAcct.id);
  const p0 = (await listAccountsWithBalance(seed.l1.id)).find((a: any) => a.id === payer.id).balanceCents;
  assert.strictEqual(p0, 100000);

  // 编辑成本到 1500 元（150000）：可用 = 当前 100000 + 旧买入释放 100000 = 200000 → 通过
  const u = await updateInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, hid, { ...baseInput(payer.id, "1500"), accountId: fundAcct.id },
  );
  assert.strictEqual(u.ok, true, `编辑应成功: ${JSON.stringify(u)}`);
  const p1 = (await listAccountsWithBalance(seed.l1.id)).find((a: any) => a.id === payer.id).balanceCents;
  assert.strictEqual(p1, 50000, "扣款账户应变为 200000-150000 = 50000");
});

test("编辑买入：调高成本超过（余额+旧买入释放额）→ 拦截、持仓/流水不变", async () => {
  const fundAcct = await makeFundAcct();
  const payer = await makePayerAcct(200000);
  const c = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, { ...baseInput(payer.id, "1000"), accountId: fundAcct.id },
  );
  assert.strictEqual(c.ok, true);
  const hid = await holdingIdFor(fundAcct.id);
  const before = await counts();

  // 编辑成本到 2500 元（250000）：可用 = 200000 < 250000 → 拦截
  const u = await updateInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, hid, { ...baseInput(payer.id, "2500"), accountId: fundAcct.id },
  );
  assert.strictEqual(u.ok, false, "应被拦截");
  assert.strictEqual(u.error, "errors.insufficientBalance");

  const after = await counts();
  assert.strictEqual(after.holdings, before.holdings, "持仓数不应变化");
  assert.strictEqual(after.txs, before.txs, "流水数不应变化");
  const [h] = await db.select().from(investmentHoldings).where(eq(investmentHoldings.id, hid)).limit(1);
  assert.strictEqual(h.costCents, 100000, "成本不应被改写");
});

test("编辑买入：切换扣款账户到余额不足账户 → 拦截（旧买入释放额不计入新扣款账户）", async () => {
  const fundAcct = await makeFundAcct();
  const payer = await makePayerAcct(200000);
  const c = await createInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, { ...baseInput(payer.id, "1000"), accountId: fundAcct.id },
  );
  assert.strictEqual(c.ok, true);
  const hid = await holdingIdFor(fundAcct.id);
  const before = await counts();

  // 换成 ac1（余额 -16300）作扣款账户：旧买入属于原 payer，不计入新账户可用额度 → 100000 > -16300 → 拦截
  const u = await updateInvestmentService(
    { id: seed.u1.id } as any, seed.l1.id, hid, { ...baseInput(seed.ac1.id, "1000"), accountId: fundAcct.id },
  );
  assert.strictEqual(u.ok, false, "应被拦截");
  assert.strictEqual(u.error, "errors.insufficientBalance");

  const after = await counts();
  assert.strictEqual(after.holdings, before.holdings);
  assert.strictEqual(after.txs, before.txs);
});
