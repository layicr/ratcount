// ratcount · 服务层权限守卫（模式无关）/ Service-layer access guard (mode-agnostic)
//  - 与 lib/scope 的服务端守卫（基于 cookie/redirect 的 requireXxx）不同，这里直接查库判定成员/角色，
//    因此服务端 action 与桌面主进程 IPC 可共用同一套判定，避免越权写入。
//  - Differs from lib/scope's cookie/redirect guards: it checks membership/role against the DB directly,
//    so both the server action and the desktop main's IPC handler can use the same check (no cookie/redirect).
import { and, eq } from "drizzle-orm";
import { ledgerMembers } from "@/db/schema";
import { MR, ROLE, type MemberRole } from "@/lib/constants";
import { db } from "@/lib/db";

/** 操作主体（由调用方在鉴权后注入；服务端来自 session，桌面来自本地令牌）/ Actor injected by the caller after auth */
export type Actor = { id: string; role?: string; name?: string | null };

/** 守卫结果 / Guard result */
export type GuardResult = { ok: true } | { ok: false; error: string };

/** 必须为管理员 / Require an admin role */
export function assertAdmin(actor: Actor): GuardResult {
  if (actor.role !== ROLE.admin) return { ok: false, error: "errors.adminOnly" };
  return { ok: true };
}

/** 必须为账本成员（可选最小角色）/ Require ledger membership (optional minimum role) */
export async function assertLedgerRole(
  actor: Actor,
  ledgerId: string,
  minRole: MemberRole = MR.viewer,
): Promise<GuardResult> {
  const [member] = await db
    .select({ role: ledgerMembers.role })
    .from(ledgerMembers)
    .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, actor.id)))
    .limit(1);
  if (!member) return { ok: false, error: "errors.noLedger" };
  if (minRole === MR.owner && member.role !== MR.owner) return { ok: false, error: "errors.forbidden" };
  if (minRole === MR.editor && member.role === MR.viewer) return { ok: false, error: "errors.forbidden" };
  return { ok: true };
}
