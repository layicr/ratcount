"use server";

import { revalidatePath } from "next/cache";
import { inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import { requireUser } from "@/lib/scope";
import { withAudit } from "@/lib/audit";

/** 批量删除审计日志（管理员；删除动作本身自反留痕） */
export async function deleteAuditLogs(ids: string[]) {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false as const, error: "errors.adminOnly" };
  if (!ids.length) return { ok: false as const, error: "errors.noLogsSelected" };

  await withAudit(
    { userId: user.id, action: "D", entity: "audit_log", summary: `批量删除 ${ids.length} 条操作日志（自反留痕）`, requestBody: JSON.stringify({ count: ids.length }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(auditLogs).where(inArray(auditLogs.id, ids)); },
  );
  revalidatePath("/logs");
  return { ok: true as const, error: null };
}

/** 清理超期日志（按设置保留天数） */
export async function clearExpiredLogs() {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false as const, error: "errors.adminOnly" };

  const { getSetting } = await import("@/lib/settings");
  const days = parseInt((await getSetting("audit_log_retention_days")) ?? "90", 10);
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  await withAudit(
    { userId: user.id, action: "D", entity: "audit_log", summary: `清理 ${days} 天前日志（自反留痕）`, requestBody: JSON.stringify({ retentionDays: days }), responseBody: '{"result":"cleared"}' },
    async (tx) => { await tx.delete(auditLogs).where(lte(auditLogs.createdAt, cutoff)); },
  );
  revalidatePath("/logs");
  return { ok: true as const, error: null };
}
