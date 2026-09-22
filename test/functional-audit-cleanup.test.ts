/**
 * ratcount · 功能测试：审计日志保留策略与清理（lib/audit-cleanup）
 * 覆盖：resolveRetentionDays 读取设置、purgeExpiredAuditLogs 删除超期日志
 *       且保留未超期日志、清理不写审计（避免自递归）。
 * 依赖：DB 测试夹具（含 audit_logs / settings 表）。
 * 运行：npx tsx --test test/functional-audit-cleanup.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb } from "./helpers/db-fixture";

let db: any;
let auditLogs: any;
let settings: any;
let resolveRetentionDays: any;
let purgeExpiredAuditLogs: any;
let getSetting: any;

const NOW = Date.now();
const MS_DAY = 24 * 60 * 60 * 1000;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ auditLogs, settings } = await import("../db/schema"));
  ({ resolveRetentionDays, purgeExpiredAuditLogs } = await import("../lib/audit-cleanup"));
  ({ getSetting } = await import("../lib/settings"));

  // 设置保留 7 天
  await db.insert(settings).values({
    id: "s-audit-ret",
    userId: "global",
    key: "audit_log_retention_days",
    value: "7",
    updatedAt: new Date(NOW - MS_DAY).toISOString(),
  });

  // 插入 3 条 10 天前（超期）+ 2 条今天（未超期）
  const logs: any[] = [];
  for (let i = 0; i < 3; i++) {
    logs.push({
      id: `old-${i}`,
      userId: "u-test",
      action: "create",
      entity: "transaction",
      entityId: `tx-old-${i}`,
      summary: `过期日志 ${i}`,
      createdAt: new Date(NOW - 10 * MS_DAY).toISOString(),
    });
  }
  for (let i = 0; i < 2; i++) {
    logs.push({
      id: `new-${i}`,
      userId: "u-test",
      action: "update",
      entity: "transaction",
      entityId: `tx-new-${i}`,
      summary: `新日志 ${i}`,
      createdAt: new Date(NOW).toISOString(),
    });
  }
  await db.insert(auditLogs).values(logs);
});

test("保留: resolveRetentionDays 读取设置中的 7 天", async () => {
  assert.strictEqual(await resolveRetentionDays(), 7);
});

test("保留: purgeExpiredAuditLogs 删除超期日志并保留未超期（返回 days/deleted）", async () => {
  const r = await purgeExpiredAuditLogs();
  assert.deepStrictEqual(r, { days: 7, deleted: 3 });

  const remain = await db.select().from(auditLogs);
  assert.strictEqual(remain.length, 2, "应仅剩 2 条未超期日志");
  const ids = remain.map((x: any) => x.id).sort();
  assert.deepStrictEqual(ids, ["new-0", "new-1"]);
});

test("保留: 清理不会写新的审计日志（避免自递归）", async () => {
  const after = await db.select().from(auditLogs);
  assert.strictEqual(after.length, 2);
  // 清理动作不产生 action=cleanup 的审计行
  const cleanups = after.filter((x: any) => x.action === "cleanup");
  assert.strictEqual(cleanups.length, 0);
});

test("保留: getSetting 可读到保留天数设置（审计查询基础）", async () => {
  assert.strictEqual(await getSetting("audit_log_retention_days"), "7");
});
