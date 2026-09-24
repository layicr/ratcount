/**
 * ratcount · 投资持仓「复制」功能测试（服务层，复用 DB 测试夹具）
 *
 * 覆盖：
 *   - 复制 active 持仓：生成同源新持仓（名称加副本、状态 active、派息清零、金额一致）
 *   - 买入日/起息日 = 今天；到期日按原期限顺延
 *   - 联动生成「买入」转账流水（扣款账户 → 关联账户，金额 = 成本 + 费用）
 *   - 复制持仓标签
 *   - 仅 active 可复制，已结算返回 investment.notActive
 *   - 扣款账户 === 关联账户时不生成买入流水（与 create 一致）
 *
 * 依赖：test/helpers/db-fixture.ts（独立临时 SQLite）
 * 运行：npx tsx --test test/investment-copy.test.ts
 *
 * 注意：before 只建一次库，所有 test 共享同一 db，故每个用例用唯一持仓名避免串扰。
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

let db: any;
let seed: any;
let copyInvestmentService: any;
let investmentHoldings: any;
let holdingTags: any;
let transactions: any;
let todayStr: any;
let daysBetween: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({ copyInvestmentService } = await import("../lib/services/investments"));
  ({ investmentHoldings, holdingTags, transactions } = await import("../db/schema"));
  ({ todayStr, daysBetween } = await import("../lib/investment-flow"));
});

/** 按唯一基名插入一条持仓，返回 id */
async function insertHolding(name: string, over: Record<string, unknown> = {}) {
  const [h] = await db
    .insert(investmentHoldings)
    .values({
      ledgerId: seed.l1.id,
      createdBy: seed.u1.id,
      type: "stock",
      name,
      accountId: seed.ac2.id, // 关联账户
      paymentAccountId: seed.ac1.id, // 扣款账户（与关联账户不同 → 应生成买入流水）
      quantity: 100,
      costCents: 50000,
      feeCents: 1000,
      currentValueCents: 60000,
      purchaseDate: "2026-01-01",
      maturityDate: null,
      status: "active",
      dividendCents: 0,
      ...over,
    })
    .returning({ id: investmentHoldings.id });
  return h.id as string;
}

const COPIED = "（副本）";

test("复制 active 持仓：生成同源新持仓 + 买入流水 + 复制标签", async () => {
  const name = "测试持仓";
  const id = await insertHolding(name);
  await db.insert(holdingTags).values({ holdingId: id, tagId: seed.tagDaily.id });

  const res = await copyInvestmentService({ id: seed.u1.id }, seed.l1.id, id, COPIED);
  assert.equal(res.ok, true, JSON.stringify(res));

  const copy = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, name + COPIED)));
  assert.equal(copy.length, 1, "应存在一条带副本后缀的新持仓");
  const h = copy[0];
  assert.equal(h.status, "active");
  assert.equal(h.costCents, 50000);
  assert.equal(h.feeCents, 1000);
  assert.equal(h.currentValueCents, 60000);
  assert.equal(h.dividendCents, 0, "累计派息应清零");
  assert.equal(h.purchaseDate, todayStr(), "买入日应为今天");
  assert.equal(h.maturityDate, null);

  // 标签复制
  const tags = await db.select().from(holdingTags).where(eq(holdingTags.holdingId, h.id));
  assert.equal(tags.length, 1);
  assert.equal(tags[0].tagId, seed.tagDaily.id);

  // 买入流水：扣款账户(ac1) → 关联账户(ac2)，金额 = 成本+费用 = 51000
  const buys = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, seed.l1.id), eq(transactions.remark, `买入 ${name}${COPIED}`)));
  assert.equal(buys.length, 1, "应联动生成一笔买入流水");
  assert.equal(buys[0].accountId, seed.ac1.id);
  assert.equal(buys[0].toAccountId, seed.ac2.id);
  assert.equal(buys[0].amountCents, 51000);
});

test("仅 active 可复制：已结算持仓返回 investment.notActive 且不生成新持仓", async () => {
  const name = "已结算持仓";
  const id = await insertHolding(name, { status: "sold" });
  const res = await copyInvestmentService({ id: seed.u1.id }, seed.l1.id, id, COPIED);
  assert.equal(res.ok, false);
  assert.equal(res.error, "investment.notActive");

  const copy = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, name + COPIED)));
  assert.equal(copy.length, 0, "不应新增复制持仓");
});

test("到期顺延：复制定期类持仓后到期日按原期限顺延", async () => {
  const name = "存款持仓";
  const id = await insertHolding(name, {
    type: "deposit",
    purchaseDate: "2026-01-01",
    maturityDate: "2026-07-01", // 与起息日相差 181 天
  });
  const res = await copyInvestmentService({ id: seed.u1.id }, seed.l1.id, id, COPIED);
  assert.equal(res.ok, true, JSON.stringify(res));

  const copy = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, name + COPIED)));
  assert.equal(copy.length, 1);
  const h = copy[0];
  assert.equal(h.purchaseDate, todayStr());
  assert.ok(h.maturityDate, "到期日不应为空");
  // 新期限天数 = 原期限天数（181）
  const origSpan = daysBetween("2026-01-01", "2026-07-01");
  const newSpan = daysBetween(h.purchaseDate, h.maturityDate);
  assert.equal(newSpan, origSpan, "到期日应按原期限顺延");
});

test("扣款账户 === 关联账户时不生成买入流水（与 create 一致）", async () => {
  const name = "同账户持仓";
  const id = await insertHolding(name, { accountId: seed.ac1.id, paymentAccountId: seed.ac1.id });
  const res = await copyInvestmentService({ id: seed.u1.id }, seed.l1.id, id, COPIED);
  assert.equal(res.ok, true, JSON.stringify(res));

  const copy = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.ledgerId, seed.l1.id), eq(investmentHoldings.name, name + COPIED)));
  assert.equal(copy.length, 1);

  const buys = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, seed.l1.id), eq(transactions.remark, `买入 ${name}${COPIED}`)));
  assert.equal(buys.length, 0, "同账户不应生成买入流水");
});
