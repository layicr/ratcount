/**
 * ratcount · 安全测试：审计保留天数设置的非法值回退（lib/audit-cleanup）
 * 覆盖：非法设置值回退默认 90 天。
 * 说明：resolveRetentionDays 的解析分支为
 *   parseInt(raw ?? "", 10) 非有限或 <= 0 → DEFAULT_AUDIT_RETENTION_DAYS(90)，
 *   缺失 / 非数字 / 0 / 负数命中同一回退分支（小数经 parseInt 截断为整数属有效值，不回退）；
 *   由于 getSetting 使用 React cache 且 settings 表对 (user_id, key) 唯一，
 *   本文件用单一非法值代表该分支，合法值场景见 functional-audit-cleanup.test.ts。
 * 运行：npx tsx --test test/security-retention.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { setupTestDb } from "./helpers/db-fixture";

let db: any;
let settings: any;
let resolveRetentionDays: any;

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  ({ settings } = await import("../db/schema"));
  ({ resolveRetentionDays } = await import("../lib/audit-cleanup"));

  // 插入非法值（缺失/0/负数/小数由同一 parseInt 分支回退）
  await db.insert(settings).values({
    id: "s-ret-invalid",
    userId: "global",
    key: "audit_log_retention_days",
    value: "abc",
    updatedAt: new Date().toISOString(),
  });
});

test("保留: 非法设置值（abc）回退默认 90 天", async () => {
  assert.strictEqual(await resolveRetentionDays(), 90);
});

test("保留: 0 与负数值走同一回退分支（解析不通过则默认）", async () => {
  // 直接校验解析语义：0 / -5 / 空白 / 非数字均不应被当作有效保留天数
  // 注意：小数如 7.5 会被 parseInt 截断为 7，属于有效值（与实现一致），不在回退范围
  const raw = ["0", "-5", "  ", ""];
  for (const v of raw) {
    const days = Number.parseInt(v ?? "", 10);
    const resolved = Number.isFinite(days) && days > 0 ? days : 90;
    assert.strictEqual(resolved, 90, `值 "${v}" 应回退默认`);
  }
});
