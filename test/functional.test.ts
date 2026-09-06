/**
 * ratcount · 功能测试（业务逻辑 / 查询聚合 / Server Actions 行为 / 审计事务）
 * 依赖：DB 测试夹具初始化临时 SQLite（test/helpers/db-fixture.ts）
 * 运行：npx tsx --test test/functional.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

// lib/db 依赖进程环境变量，必须在 import 前注入，因此 DB 相关模块改为 before 钩子动态加载
let db: any;
let seed: any;
let listAccountsWithBalance: any;
let listTransactions: any;
let countTransactions: any;
let dashboardStats: any;
let categoryBreakdown: any;
let projectSummary: any;
let tagSummary: any;
let yearSummary: any;
let listBalances: any;
let listCurrencies: any;
let listAuditLogs: any;
let withAudit: any;
let writeAudit: any;

const YEAR2026 = { type: "year", year: 2026 } as const;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ listAccountsWithBalance, listTransactions, countTransactions, dashboardStats, categoryBreakdown, projectSummary, tagSummary, yearSummary, listBalances, listCurrencies, listAuditLogs } =
    await import("../lib/queries"));
  ({ withAudit, writeAudit } = await import("../lib/audit"));
  seed = await seedTestData(db);
});

/* ==================== 1. 账户余额（期初 + 实时流水汇总） ==================== */

test("余额: 期初 + 流水实时汇总（支出减/收入加/转账出-入+）", async () => {
  const accts = await listAccountsWithBalance(seed.l1.id);
  const m: any = new Map(accts.map((a: any) => [a.id, a]));
  // 现金：期初 10000 - 支出(4800+1500) - 转出 20000 = -16300
  assert.strictEqual(m.get(seed.ac1.id).balanceCents, -16300);
  // 借记卡：期初 500000 + 收入 800000 + 转入 20000 = 1320000
  assert.strictEqual(m.get(seed.ac2.id).balanceCents, 1320000);
});

test("余额: 转账不计收支但一出一进，总资产守恒", async () => {
  // 转账 20000 从现金到借记卡：现金 -20000、借记卡 +20000
  const accts = await listAccountsWithBalance(seed.l1.id);
  const m: any = new Map(accts.map((a: any) => [a.id, a]));
  const total = accts.filter((a: any) => a.isAsset).reduce((s: number, a: any) => s + a.balanceCents, 0);
  assert.strictEqual(total, 1303700);
});

test("余额: 空账本返回空列表（无流水也安全）", async () => {
  const accts = await listAccountsWithBalance("no-such-ledger");
  assert.strictEqual(accts.length, 0);
});

/* ==================== 2. 流水查询与过滤 ==================== */

test("流水: 默认列表返回本账本全部流水（含关联信息）", async () => {
  const rows = await listTransactions(seed.l1.id);
  assert.strictEqual(rows.length, 4);
  const t1 = rows.find((r: any) => r.id === seed.t1.id);
  assert.ok(t1);
  assert.strictEqual(t1.category?.name, "餐饮");
  assert.strictEqual(t1.project?.name, "装修");
  assert.strictEqual(t1.tagList.length, 1);
  assert.strictEqual(t1.tagList[0].name, "日常");
});

test("流水: 转账行带目标账户", async () => {
  const rows = await listTransactions(seed.l1.id);
  const tr = rows.find((r: any) => r.type === "transfer");
  assert.ok(tr);
  assert.strictEqual(tr.toAccount?.id, seed.ac2.id);
});

test("计数: 全量 / 类型 / 关键词（备注/项目名/标签名）命中", async () => {
  assert.strictEqual(await countTransactions(seed.l1.id), 4);
  assert.strictEqual(await countTransactions(seed.l1.id, { type: "expense" }), 2);
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "山姆" }), 1); // 备注
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "装修" }), 1); // 项目名
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "日常" }), 1); // 标签名
  assert.strictEqual(await countTransactions(seed.l1.id, { q: "不存在的词" }), 0);
});

test("过滤: 账户（含转账目标）/ 项目 / 金额区间 / 日期区间", async () => {
  assert.strictEqual(await countTransactions(seed.l1.id, { accountId: seed.ac1.id }), 3); // 支出2 + 转出1
  assert.strictEqual(await countTransactions(seed.l1.id, { projectId: seed.proj.id }), 1);
  assert.strictEqual(await countTransactions(seed.l1.id, { minAmount: 10000 }), 2); // 收入+转账
  assert.strictEqual(await countTransactions(seed.l1.id, { maxAmount: 2000 }), 1); // 午餐 1500
  assert.strictEqual(
    await countTransactions(seed.l1.id, { startDate: "2026-06-01", endDate: "2026-06-30" }),
    4,
  );
});

test("过滤: 分页 limit/offset 生效", async () => {
  const page1 = await listTransactions(seed.l1.id, { limit: 2, offset: 0 });
  const page2 = await listTransactions(seed.l1.id, { limit: 2, offset: 2 });
  assert.strictEqual(page1.length, 2);
  assert.strictEqual(page2.length, 2);
  const ids = [...page1.map((r: any) => r.id), ...page2.map((r: any) => r.id)];
  assert.strictEqual(new Set(ids).size, 4, "两页无重复");
});

/* ==================== 3. 报表聚合 ==================== */

test("仪表盘: 收入/支出/笔数/净资产（转账不计收支）", async () => {
  const s = await dashboardStats(seed.l1.id, YEAR2026);
  assert.strictEqual(s.monthIncome, 800000);
  assert.strictEqual(s.monthExpense, 6300);
  assert.strictEqual(s.monthBalance, 800000 - 6300);
  assert.strictEqual(s.incomeCount, 1);
  assert.strictEqual(s.expenseCount, 2);
  assert.strictEqual(s.totalCount, 3);
  assert.strictEqual(s.assets, 1303700);
  assert.strictEqual(s.liabilities, 0);
  assert.strictEqual(s.netWorth, 1303700);
  assert.strictEqual(s.totalBalance, 1303700);
  assert.ok(Array.isArray(s.trend) && s.trend.length === 6);
  assert.ok(Array.isArray(s.distribution));
});

test("分类占比: 支出集中在餐饮（金额 + 百分比）", async () => {
  const rows = await categoryBreakdown(seed.l1.id, "expense", YEAR2026);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].category?.name, "餐饮");
  assert.strictEqual(rows[0].cents, 6300);
  assert.strictEqual(rows[0].pct, 100);
});

test("分类占比: 收入为工资分类", async () => {
  const rows = await categoryBreakdown(seed.l1.id, "income", YEAR2026);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].category?.name, "工资");
  assert.strictEqual(rows[0].cents, 800000);
});

test("项目盈亏: 费用计入、余额为收支差", async () => {
  const rows = await projectSummary(seed.l1.id, YEAR2026);
  const p = rows.find((r: any) => r.id === seed.proj.id);
  assert.ok(p);
  assert.strictEqual(p.income, 0);
  assert.strictEqual(p.expense, 4800);
  assert.strictEqual(p.balance, -4800);
});

test("标签统计: 收入/支出金额与笔数分开统计", async () => {
  const rows = await tagSummary(seed.l1.id, YEAR2026);
  const t = rows.find((r: any) => r.id === seed.tagDaily.id);
  assert.ok(t);
  assert.strictEqual(t.incomeCents, 0);
  assert.strictEqual(t.incomeCount, 0);
  assert.strictEqual(t.expenseCents, 4800);
  assert.strictEqual(t.expenseCount, 1);
});

test("年度汇总: 按月 12 槽位，6 月有收入与支出", async () => {
  const months = await yearSummary(seed.l1.id, 2026);
  assert.strictEqual(months.length, 12);
  assert.strictEqual(months[5].income, 800000); // 6 月
  assert.strictEqual(months[5].expense, 6300);
  assert.strictEqual(months[0].income, 0); // 1 月为空
  // 转账不计入收支：6 月合计 = 收入+支出，不含 20000
});

/* ==================== 4. 余额快照对账 ==================== */

test("对账: diff = 实时余额 - 快照，无快照账户 diff=null", async () => {
  const rows = await listBalances(seed.l1.id);
  const m: any = new Map(rows.map((r: any) => [r.id, r]));
  const ac1: any = m.get(seed.ac1.id);
  assert.strictEqual(ac1.snapshot?.balanceAmountCents, 8000);
  assert.strictEqual(ac1.diff, -16300 - 8000); // -24300
  const ac2: any = m.get(seed.ac2.id);
  assert.strictEqual(ac2.snapshot, null);
  assert.strictEqual(ac2.diff, null);
});

/* ==================== 5. 币种 ==================== */

test("币种: 按 sort/code 排序，基准币种优先", async () => {
  const rows = await listCurrencies();
  assert.strictEqual(rows.length, 2);
  assert.strictEqual((rows as any[])[0].code, "CNY");
  assert.strictEqual((rows as any[])[0].isBase, true);
  assert.strictEqual((rows as any[])[1].rate, "7.2");
});

/* ==================== 6. 审计（事务一致 + 查询） ==================== */

test("审计: withAudit 业务+日志同事务提交，日志含操作者信息", async () => {
  const { transactions, categories } = await import("../db/schema");
  const created = await withAudit(
    { userId: seed.u1.id, action: "C", entity: "transaction", entityId: seed.t1.id, summary: "新增流水 测试" },
    async (tx: any) => {
      const [row] = await tx.insert(categories).values({ ledgerId: seed.l1.id, name: "临时分类", type: "expense" }).returning();
      return row;
    },
  );
  assert.ok(created?.id);

  const logs = await listAuditLogs({ userId: seed.u1.id, search: "新增流水" });
  assert.ok(logs.total >= 1);
  const hit = logs.rows.find((l: any) => l.summary === "新增流水 测试");
  assert.ok(hit);
  assert.strictEqual(hit.action, "C");
  assert.strictEqual(hit.email, "alice@test.com");
  assert.strictEqual(hit.name, "Alice");
});

test("审计: 业务失败则日志一并回滚（强一致性）", async () => {
  const { auditLogs } = await import("../db/schema");
  const before = await db.select().from(auditLogs);
  await assert.rejects(
    withAudit(
      { userId: seed.u1.id, action: "C", entity: "transaction", summary: "应回滚" },
      async () => {
        throw new Error("业务失败");
      },
    ),
  );
  const after = await db.select().from(auditLogs);
  assert.strictEqual(after.length, before.length, "业务失败时不应新增审计行");
});

test("审计: 分页与搜索（管理员视角查全部）", async () => {
  await writeAudit({ userId: seed.u2.id, action: "R", entity: "system", summary: "登录成功" });
  const all = await listAuditLogs({ page: 1, pageSize: 5 });
  assert.ok(all.total >= 1);
  assert.ok(all.rows.length >= 1);
  assert.ok(all.totalPages >= 1);
});
