/**
 * ratcount · 审计日志与账本可见性（越权防线）补充测试
 *
 * 覆盖：
 *  - lib/audit.ts  withAudit（业务+审计同事务，失败全回滚）/ writeAudit（独立写）
 *  - lib/ledger.ts getMyLedgers（成员维度可见性 → 跨用户/跨账本越权防线）
 *
 * 运行：npx tsx --test test/unit-audit-ledger.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb, seedTestData } from "./helpers/db-fixture";

let db: any;
let seed: any;
let withAudit: any;
let writeAudit: any;
let getMyLedgers: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  seed = await seedTestData(db);
  ({ withAudit, writeAudit } = await import("../lib/audit"));
  ({ getMyLedgers } = await import("../lib/ledger"));
});

/* ==================== 1. 账本可见性（越权防线） ==================== */

test("越权: 用户仅可见自己参与的账本，他人账本不可见", async () => {
  const mine = await getMyLedgers(seed.u1.id);
  const ids1 = mine.map((r: any) => r.ledger.id);
  assert.deepEqual(ids1, [seed.l1.id], "u1 只能看到自己的账本 l1");
  assert.strictEqual(mine[0].role, "owner");
  assert.ok(!ids1.includes(seed.l2.id), "u1 不可见 u2 的账本 l2");

  const mine2 = await getMyLedgers(seed.u2.id);
  const ids2 = mine2.map((r: any) => r.ledger.id);
  assert.deepEqual(ids2, [seed.l2.id], "u2 只能看到自己的账本 l2");
  assert.ok(!ids2.includes(seed.l1.id), "u2 不可见 u1 的账本 l1");
});

test("越权: 非成员用户返回空账本列表", async () => {
  // 第三个用户未加入任何账本
  const { users } = await import("../db/schema");
  const [u3] = await db.insert(users).values({
    email: "carol@test.com", passwordHash: "z", name: "Carol", role: "user", status: "active",
  }).returning();
  const rows = await getMyLedgers(u3.id);
  assert.strictEqual(rows.length, 0);
});

/* ==================== 2. 审计日志（同事务原子性） ==================== */

test("审计: withAudit 业务成功时返回结果且同事务写入审计", async () => {
  const { tags, auditLogs } = await import("../db/schema");
  const result = await withAudit(
    { userId: seed.u1.id, action: "C", entity: "tag", entityId: null, summary: "测试标签" },
    async (tx: any) => {
      const [tag] = await tx.insert(tags).values({ ledgerId: seed.l1.id, name: "审计用例标签" }).returning();
      return { tagId: tag.id };
    },
  );
  assert.ok(result.tagId);
  const auditRows = await db.select().from(auditLogs);
  assert.strictEqual(auditRows.length, 1, "业务成功必须恰好写入一条审计");
  assert.strictEqual(auditRows[0].userId, seed.u1.id);
  assert.strictEqual(auditRows[0].action, "C");
  assert.strictEqual(auditRows[0].entity, "tag");
  assert.strictEqual(auditRows[0].summary, "测试标签");
});

test("审计: withAudit 业务抛错时业务与审计全回滚", async () => {
  const { tags, auditLogs } = await import("../db/schema");
  const beforeCount = (await db.select().from(tags)).length;
  await assert.rejects(
    withAudit(
      { userId: seed.u1.id, action: "C", entity: "tag", summary: "应回滚" },
      async (tx: any) => {
        await tx.insert(tags).values({ ledgerId: seed.l1.id, name: "回滚标签" });
        throw new Error("boom");
      },
    ),
    /boom/,
  );
  const afterCount = (await db.select().from(tags)).length;
  assert.strictEqual(afterCount, beforeCount, "业务行应随事务回滚");
  const auditAfter = await db.select().from(auditLogs);
  assert.ok(!auditAfter.some((r: any) => r.summary === "应回滚"), "审计行也应回滚");
});

test("审计: writeAudit 独立写入一条记录", async () => {
  const { auditLogs } = await import("../db/schema");
  await writeAudit({ userId: seed.u2.id, action: "U", entity: "account", summary: "独立审计" });
  const rows = await db.select().from(auditLogs);
  assert.ok(rows.some((r: any) => r.summary === "独立审计" && r.userId === seed.u2.id && r.action === "U"));
});
