/**
 * 审计日志保留策略：按设置保留天数清理超期日志
 *  - purgeExpiredAuditLogs：单次清理（不写审计，避免自递归）
 *  - startAuditCleanup：进程内每日定时清理（由 instrumentation.ts 在 nodejs 运行时启动）
 * Audit-log retention: purge logs older than the configured retention days
 *  - purgeExpiredAuditLogs: one-shot cleanup (does not write audit logs, avoids self-recursion)
 *  - startAuditCleanup: in-process daily timer (started by instrumentation.ts under the nodejs runtime)
 */

import { lte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import { SETTING_KEY, DEFAULT_AUDIT_RETENTION_DAYS, MS_PER_DAY } from "@/lib/constants";
import { getSetting } from "@/lib/settings";

/** 定时清理间隔（24 小时）/ Cleanup interval (24 hours) */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 单批删除行数上限：避免一次性删除海量历史日志造成长写事务阻塞并发记账 / Per-batch delete cap: avoid one giant delete that blocks concurrent accounting via a long write tx */
const PURGE_BATCH_SIZE = 2000;

/** 解析保留天数：设置项非法/缺失时回退默认值 / Resolve retention days; fall back to default when the setting is invalid/missing */
export async function resolveRetentionDays(): Promise<number> {
  const raw = await getSetting(SETTING_KEY.auditLogRetentionDays);
  const days = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_AUDIT_RETENTION_DAYS;
}

/**
 * 删除超过保留天数的审计日志；返回 { days, deleted }
 * 分批删除（每批先取 id 再按 id 删）：既避免 DELETE...LIMIT 依赖 SQLite 编译选项，
 * 也避免一次性删除海量行造成长写事务锁库、阻塞并发记账。
 * Delete audit logs older than the retention days; returns { days, deleted }.
 * Batch delete (fetch ids first, then delete by id): avoids depending on SQLite's DELETE...LIMIT compile option,
 * and avoids a single huge delete that locks the DB and blocks concurrent accounting.
 */
export async function purgeExpiredAuditLogs(): Promise<{ days: number; deleted: number }> {
  const days = await resolveRetentionDays();
  const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
  let deleted = 0;
  for (;;) {
    const batch = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(lte(auditLogs.createdAt, cutoff))
      .limit(PURGE_BATCH_SIZE);
    if (batch.length === 0) break;
    await db.delete(auditLogs).where(inArray(auditLogs.id, batch.map((r) => r.id)));
    deleted += batch.length;
    if (batch.length < PURGE_BATCH_SIZE) break;
  }
  return { days, deleted };
}

/**
 * 启动每日定时清理。
 * @param opts.useVercelCron 为 true 时表示由 Vercel Cron 负责触发（vercel.json 的 crons
 *   定时调用 /api/cron/cleanup-audit），本进程不再启动 setInterval（无状态函数里定时器无意义）；
 *   =false（默认）时启动进程内定时器，供自托管/本地长期运行的 Node 进程使用。
 * Start the daily cleanup timer.
 * @param opts.useVercelCron when true, Vercel Cron drives it (vercel.json crons call /api/cron/cleanup-audit),
 *   so this process doesn't start a setInterval (timers are meaningless in stateless functions);
 *   =false (default) starts an in-process timer for self-hosted / long-running local Node processes.
 */
export function startAuditCleanup(opts?: { useVercelCron?: boolean }): void {
  if (opts?.useVercelCron) {
    console.info(
      "[audit-cleanup] Vercel 环境：清理交由 Vercel Cron 触发（/api/cron/cleanup-audit），本进程不启动定时器 / delegating to Vercel Cron",
    );
    return;
  }

  const run = async () => {
    try {
      const { days, deleted } = await purgeExpiredAuditLogs();
      // 独立留痕（不写 audit_logs 以免自递归）：便于运维追溯自动清理动作 / Separate trace (not in audit_logs, to avoid self-recursion) for ops visibility
      if (deleted > 0) {
        console.info(
          `[audit-cleanup] 已清理 ${deleted} 条超过 ${days} 天的审计日志 / purged ${deleted} audit log(s) older than ${days} day(s)`,
        );
      }
    } catch (e) {
      console.error("[audit-cleanup] 清理过期审计日志失败 / Failed to purge expired audit logs", e);
    }
  };

  void run();
  const timer = setInterval(() => void run(), CLEANUP_INTERVAL_MS);
  // 不阻止进程退出（Node 环境下 setInterval 具备 unref）/ Don't keep the process alive (setInterval is unref'd in Node)
  if (typeof timer.unref === "function") timer.unref();
}
