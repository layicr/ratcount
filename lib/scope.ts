import { redirect } from "next/navigation";
import { cache } from "react";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerMembers, users } from "@/db/schema";
import { auth } from "@/auth";

/**
 * 服务端权限守卫（scopeGuard）
 *  - requireUser：必须登录，否则重定向 /login
 *  - requireLedgerAccess：必须为账本成员（可选最小角色），否则重定向 /dashboard
 * 所有写操作与敏感查询都必须经由这两个守卫，防止越权访问
 */

export type SessionUser = { id: string; role: string; name?: string | null; email?: string | null };

/** 必须登录 / Require a signed-in user */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // 从数据库查询最新用户信息，确保昵称等字段更新后立即可见
  // Query latest user info from DB to ensure nickname changes are visible immediately
  const [dbUser] = await db
    .select({ id: users.id, role: users.role, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (dbUser) {
    return {
      id: dbUser.id,
      role: dbUser.role,
      name: dbUser.name,
      email: dbUser.email,
    };
  }

  // 数据库查询失败时回退到 session 信息 / Fallback to session if DB query fails
  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
});

/** 必须为账本成员（可选最小角色）/ Require membership in a ledger */
export async function requireLedgerAccess(
  ledgerId: string,
  minRole?: "owner" | "editor" | "viewer",
) {
  const user = await requireUser();
  const [member] = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (!member) redirect("/dashboard");
  if (minRole === "owner" && member.role !== "owner") redirect("/dashboard");
  if (minRole === "editor" && !["owner", "editor"].includes(member.role)) redirect("/dashboard");
  return { user, member };
}
