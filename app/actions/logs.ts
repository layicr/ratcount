"use server";

// ratcount · 审计日志写操作（薄封装）/ Audit log writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/settings（deleteAuditLogsService / clearExpiredLogsService）；此处仅做守卫 + revalidatePath。
import { ROLE, SETTINGS_LOGS_PATH } from "@/lib/constants";
import { requireUser } from "@/lib/scope";
import * as svc from "@/lib/services/settings";
import { revalidatePath } from "next/cache";

export async function deleteAuditLogs(ids: string[]) {
  const user = await requireUser();
  if (user.role !== ROLE.admin) return { ok: false as const, error: "errors.adminOnly" };
  const r = await svc.deleteAuditLogsService({ id: user.id, role: user.role }, ids);
  if (r.ok) revalidatePath(SETTINGS_LOGS_PATH);
  return r;
}

export async function clearExpiredLogs() {
  const user = await requireUser();
  if (user.role !== ROLE.admin) return { ok: false as const, error: "errors.adminOnly" };
  const r = await svc.clearExpiredLogsService({ id: user.id, role: user.role });
  if (r.ok) revalidatePath(SETTINGS_LOGS_PATH);
  return r;
}
