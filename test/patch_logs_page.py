# -*- coding: utf-8 -*-
"""Patch logs page to filter by user id (user dimension isolation)."""
import io

p = r"app/(app)/logs/page.tsx"
s = io.open(p, encoding="utf-8").read()

old_imports = """import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";"""
new_imports = """import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getLocale, getDictionary } from "@/lib/i18n";"""
assert old_imports in s, "imports not found"
s = s.replace(old_imports, new_imports)

old_head = """/** 操作日志：全部操作留痕（增/查/改/删）+ 批量删除 + 清理 */
export default async function LogsPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  const ACTION_LABELS: Record<string, string> = { C: d.logs.actionC, R: d.logs.actionR, U: d.logs.actionU, D: d.logs.actionD };
  if (!ledger) redirect("/login");

  const rows = await db
    .select({ log: auditLogs, email: users.email, name: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.ledgerId, ledger.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);"""
new_head = """/** 操作日志：写操作留痕（C/U/D）+ 批量删除 + 清理；按用户维度隔离 */
export default async function LogsPage() {
  const user = await requireUser();
  const d = getDictionary(await getLocale());
  const ACTION_LABELS: Record<string, string> = { C: d.logs.actionC, R: d.logs.actionR, U: d.logs.actionU, D: d.logs.actionD };

  // 管理员查看全部日志；普通用户仅查看自己的日志（按用户编号隔离）
  let rows;
  if (user.role === "admin") {
    rows = await db
      .select({ log: auditLogs, email: users.email, name: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(300);
  } else {
    rows = await db
      .select({ log: auditLogs, email: users.email, name: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(eq(auditLogs.userId, user.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(300);
  }"""
assert old_head in s, "head not found"
s = s.replace(old_head, new_head)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("OK")
