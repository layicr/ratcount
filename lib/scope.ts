import { users, ledgerMembers } from "@/db/schema"
import { LOGIN_PATH, DASHBOARD_PATH, MR, ROLE, USER_STATUS, type MemberRole } from "@/lib/constants";

import { redirect } from "next/navigation";
import { cache } from "react";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";



import { auth } from "@/auth";

/**
 * 服务端权限守卫（scopeGuard）
 *  - getSessionUser：解析仍有效的登录用户，无效返回 null（不重定向，供登录/注册页与守卫共用）
 *  - requireUser：必须登录，否则重定向 /login
 *  - requireLedgerAccess：必须为账本成员（可选最小角色），否则重定向 /dashboard
 *  - 所有写操作与敏感查询都必须经由这两个守卫，防止越权访问
 * Server-side access guards (scopeGuard)
 *  - getSessionUser: resolve the still-valid user, null when invalid (no redirect; shared by login/register/guards)
 *  - requireUser: must be signed in, otherwise redirect to /login
 *  - requireLedgerAccess: must be a ledger member (optional min role), otherwise redirect to /dashboard
 *  - All writes and sensitive queries must pass through these guards to prevent privilege escalation
 */

export type SessionUser = { id: string; role: string; name?: string | null; email?: string | null };

/**
 * 解析「仍然有效」的登录用户（不重定向，无效返回 null）/ Resolve the still-valid signed-in user (no redirect; null when invalid)
 *  - 唯一判定：JWT 有效 ≠ 会话有效，必须同时满足「库中存在 + 已启用 + tokenVersion 一致」。
 *  - /login、/register 与 requireUser 共用此函数，避免「登录页只看 JWT 就放行、守卫回查数据库后拒绝」
 *    造成的重定向死循环（/dashboard ⇄ /login）。
 * Single source of validity: a valid JWT ≠ a valid session; the user must still exist, be active, and
 * match tokenVersion. Shared by /login, /register and requireUser to avoid the redirect loop where
 * /login trusts the JWT while the guard rejects it after a DB check.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  // 从数据库查询最新用户信息，确保昵称等字段更新后立即可见 / Query latest user info from DB so nickname changes are visible immediately
  const [dbUser] = await db
    .select({
      id: users.id, role: users.role, name: users.name, email: users.email,
      status: users.status, tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // 库中无此用户（已删除）或已禁用 → 一律视为未登录；绝不回退到 token 里的 id/role（避免用户被删后 fail-open 放行）
  // User missing (deleted) or disabled → treat as signed-out. Never fall back to id/role from the token (avoids fail-open after deletion).
  if (!dbUser || dbUser.status !== USER_STATUS.active) return null;

  // 会话版本不一致（改密 / 管理员重置密码 / 强制下线）→ 旧 JWT 立即失效；兼容历史 token：缺该声明按 0 处理
  // Token version mismatch (password change / admin reset / forced logout) invalidates the old JWT immediately. For legacy tokens, treat a missing claim as 0.
  if (Number(session.user.tokenVersion ?? 0) !== Number(dbUser.tokenVersion ?? 0)) return null;

  return {
    id: dbUser.id,
    role: dbUser.role,
    name: dbUser.name,
    email: dbUser.email,
  };
});

/** 必须登录 / Require a signed-in user */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
});

/** 必须为管理员（写操作抛错，调用方转 i18n 错误码）/ Require an admin user (throws; caller maps to an i18n error code) */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== ROLE.admin) throw new Error("errors.adminOnly");
  return user;
}

/** 必须为账本成员（可选最小角色）/ Require membership in a ledger (optional minimum role) */
export const requireLedgerAccess = cache(async (
  ledgerId: string,
  minRole?: MemberRole,
) => {
  const user = await requireUser();
  // 只取 role 字段即可，避免全行查询 / Select only the role field to avoid a full-row query
  const [member] = await db
    .select({ role: ledgerMembers.role })
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (!member) redirect(DASHBOARD_PATH);
  if (minRole === MR.owner && member.role !== MR.owner) redirect(DASHBOARD_PATH);
  if (minRole === MR.editor && member.role === MR.viewer) redirect(DASHBOARD_PATH);
  return { user, member };
});

/** 快捷守卫：必须是 editor 或以上角色 / Convenience guard: editor role or above */
export async function requireLedgerEditor(ledgerId: string) {
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  return { user, ledgerId };
}
