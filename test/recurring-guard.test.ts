/**
 * ratcount · 定期计划执行余额守卫：扣款账户余额不足则拦截（不写流水、不推进 nextDate）
 * runRecurringPlanService: block when payer balance < planned amount (expense/transfer), return errors.insufficientBalance
 * 运行：npx tsx --test test/recurring-guard.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, count } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";
import { recurringPlans, transactions } from "../db/schema";

let db: any;
let seed: any;
let listAccountsWithBalance: any;
let runRecurringPlanService: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ listAccountsWithBalance } = await import("../lib/queries"));
  ({ runRecurringPlanService } = await import("../lib/services/recurring"));
  seed = await seedTestData(db);
});

async function makePlan(accountId: string, amountCents: number) {
  const id = `plan_${accountId}_${amountCents}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(recurringPlans).values({
    id,
    ledgerId: seed.l1.id,
    name: "测试计划",
    type: "expense",
    amountCents,
    frequency: "monthly",
    dayOfMonth: 1,
    accountId,
    toAccountId: null,
    categoryId: null,
    projectId: null,
    nextDate: "2026-07-01",
    status: "active",
    createdBy: seed.u1.id,
  });
  return id;
}

async function txCount() {
  const [r] = await db.select({ c: count() }).from(transactions).where(eq(transactions.ledgerId, seed.l1.id));
  return Number(r.c);
}

test("余额不足：expense 计划扣款账户余额<金额 → 拦截、不写流水、不推进 nextDate", async () => {
  // 现金 ac1 在 seed 后余额 = 10000 - 4800 - 1500 - 20000 = -16300（已为负）
  const accts = await listAccountsWithBalance(seed.l1.id);
  const ac1 = accts.find((a: any) => a.id === seed.ac1.id);
  assert.ok(ac1.balanceCents < 0, "前置：ac1 应为负，便于构造不足场景");

  const planId = await makePlan(seed.ac1.id, 10000); // 计划 100.00 > 余额(-16300)
  const before = await txCount();

  const r = await runRecurringPlanService({ id: seed.u1.id } as any, seed.l1.id, planId);
  assert.strictEqual(r.ok, false, "应被拦截");
  assert.strictEqual(r.error, "errors.insufficientBalance");

  assert.strictEqual(await txCount(), before, "不应写入任何流水");
  const [after] = await db.select({ nextDate: recurringPlans.nextDate }).from(recurringPlans).where(eq(recurringPlans.id, planId));
  assert.strictEqual(after.nextDate, "2026-07-01", "nextDate 不应推进");
});

test("余额充足：expense 计划扣款账户余额≥金额 → 正常写入并推进 nextDate", async () => {
  // 借记卡 ac2 在 seed 后余额 = 500000 + 800000 + 20000 = 1320000
  const accts = await listAccountsWithBalance(seed.l1.id);
  const ac2 = accts.find((a: any) => a.id === seed.ac2.id);
  assert.ok(ac2.balanceCents >= 5000, "前置：ac2 余额应足够");

  const planId = await makePlan(seed.ac2.id, 5000); // 计划 50.00 < 余额
  const before = await txCount();

  const r = await runRecurringPlanService({ id: seed.u1.id } as any, seed.l1.id, planId);
  assert.strictEqual(r.ok, true, `应成功: ${JSON.stringify(r)}`);

  assert.strictEqual(await txCount(), before + 1, "应新增一条流水");
  const [after] = await db.select({ nextDate: recurringPlans.nextDate }).from(recurringPlans).where(eq(recurringPlans.id, planId));
  assert.strictEqual(after.nextDate, "2026-08-01", "nextDate 应推进一个月");
});
