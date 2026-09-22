"use server";

// ratcount · 用户管理（读保留，写抽服务）/ User management (reads kept, writes delegated)
//  - createUser/updateUser/resetUserPassword/deleteUser 的写逻辑已抽到 lib/services/admin；
//    此处仅做守卫（requireAdmin），服务端行为零回归。
import { ledgerMembers, users } from "@/db/schema";
import { ROLE, AUDIT_ACTION, ENTITY } from "@/lib/constants";
import { requireAdmin } from "@/lib/scope";
import { eq, like, or, desc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as svc from "@/lib/services/admin";
import type { CreateUserInput, UpdateUserInput } from "@/lib/services/admin";

const MAX_PAGE_SIZE = 1000; // 最大每页条数（防止恶意请求）

/** 查询用户列表（支持搜索 + 分页） */
export async function listUsers(search?: string, page = 1, pageSize = 20) {
  await requireAdmin();

  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  if (search && search.trim()) {
    const keyword = `%${search.trim()}%`;
    return db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, remark: users.remark, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(or(like(users.name, keyword), like(users.email, keyword), like(users.id, keyword)))
      .orderBy(desc(users.createdAt))
      .limit(safePageSize)
      .offset(offset);
  }

  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, remark: users.remark, createdAt: users.createdAt, updatedAt: users.updatedAt })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(safePageSize)
    .offset(offset);
}

/** 统计用户总数（支持搜索） */
export async function countUsers(search?: string): Promise<number> {
  await requireAdmin();

  if (search && search.trim()) {
    const keyword = `%${search.trim()}%`;
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(or(like(users.name, keyword), like(users.email, keyword), like(users.id, keyword)));
    return row?.value ?? 0;
  }

  const [row] = await db.select({ value: count() }).from(users);
  return row?.value ?? 0;
}

/** 根据 ID 查询用户 */
export async function getUserById(id: string) {
  await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/** 创建用户 */
export async function createUser(input: CreateUserInput) {
  const admin = await requireAdmin();
  return svc.createUserService({ id: admin.id }, input);
}

/** 更新用户 */
export async function updateUser(id: string, input: UpdateUserInput) {
  const admin = await requireAdmin();
  return svc.updateUserService({ id: admin.id }, id, input);
}

/** 重置用户密码 */
export async function resetUserPassword(id: string, newPassword: string) {
  const admin = await requireAdmin();
  return svc.resetUserPasswordService({ id: admin.id }, id, newPassword);
}

/** 删除用户 */
export async function deleteUser(id: string) {
  const admin = await requireAdmin();
  return svc.deleteUserService({ id: admin.id }, id);
}
