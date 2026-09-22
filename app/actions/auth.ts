"use server";

import { auth } from "@/auth";
import { writeAudit } from "@/lib/audit";
import { AUDIT_ACTION, ENTITY } from "@/lib/constants";
import { headers } from "next/headers";

/**
 * 认证审计日志（auth audit actions）
 *  - logLogout：退出登录前写审计日志（客户端 signOut 之前调用）
 *  登录/注册的审计日志直接在 auth.ts / register/actions.ts 中写入
 */

/** 退出登录写日志 / Log logout action */
export async function logLogout() {
  const session = await auth();
  if (!session?.user) return { ok: false };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  await writeAudit({
    userId: session.user.id,
    action: AUDIT_ACTION.update, // 退出视为状态变更
    entity: ENTITY.auth,
    summaryKey: "audit.logout", summaryParams: { email: session.user.email ?? session.user.name ?? "未知" },
    requestBody: JSON.stringify({ email: session.user.email, name: session.user.name }),
    responseBody: '{"result":"logged-out"}',
    ip,
  });

  return { ok: true };
}
