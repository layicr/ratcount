"use server";

import { eq, like, or, desc, count, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/scope";
import { writeAudit } from "@/lib/audit";

const BCRYPT_COST = 12; // bcrypt cost（安全与性能平衡值）
const MAX_PAGE_SIZE = 1000; // 最大每页条数（防止恶意请求）

/**
 * 校验当前用户是否为管理员 / Verify current user is admin
 */
async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("errors.adminOnly");
  }
  return user;
}

/**
 * 查询用户列表（支持搜索 + 分页）/ Query user list (with search + pagination)
 * - 搜索：用户名 / 邮箱 模糊匹配
 * - 分页：page 从 1 开始，pageSize 由调用方校验是否在允许范围内
 */
export async function listUsers(search?: string, page = 1, pageSize = 20) {
  await requireAdmin();

  // 校验分页参数 / Validate pagination params
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  if (search && search.trim()) {
    const keyword = `%${search.trim()}%`;
    const result = await db
      .select()
      .from(users)
      .where(or(
        like(users.name, keyword),
        like(users.email, keyword),
        like(users.id, keyword),
      ))
      .orderBy(desc(users.createdAt))
      .limit(safePageSize)
      .offset(offset);
    return result;
  }

  const result = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(safePageSize)
    .offset(offset);
  return result;
}

/**
 * 统计用户总数（支持搜索）/ Count users (with search)
 */
export async function countUsers(search?: string): Promise<number> {
  await requireAdmin();

  if (search && search.trim()) {
    const keyword = `%${search.trim()}%`;
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(or(
        like(users.name, keyword),
        like(users.email, keyword),
        like(users.id, keyword),
      ));
    return row?.value ?? 0;
  }

  const [row] = await db.select({ value: count() }).from(users);
  return row?.value ?? 0;
}

/**
 * 根据 ID 查询用户 / Get user by ID
 */
export async function getUserById(id: string) {
  await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/**
 * 创建用户 / Create user
 * - 校验：邮箱格式、密码长度、邮箱唯一性
 * - bcrypt 加密密码
 * - 写审计日志
 */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  remark?: string;
}) {
  const admin = await requireAdmin();

  // 校验输入 / Validate input
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim().toLowerCase();

  if (trimmedName.length < 1 || trimmedName.length > 30) {
    return { ok: false as const, error: "userMgmt.nameInvalid" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { ok: false as const, error: "userMgmt.emailInvalid" };
  }
  if (input.password.length < 6 || input.password.length > 72) {
    return { ok: false as const, error: "userMgmt.passwordLength" };
  }

  // 检查邮箱是否已存在 / Check email uniqueness
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmedEmail)).limit(1);
  if (existing) {
    return { ok: false as const, error: "userMgmt.emailExists" };
  }

  // 加密密码 / Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  // 插入用户 / Insert user
  const [newUser] = await db
    .insert(users)
    .values({
      name: trimmedName,
      email: trimmedEmail,
      passwordHash,
      role: input.role,
      status: input.status,
      remark: input.remark ?? null,
    })
    .returning();

  // 写审计日志 / Log audit
  await writeAudit({
    userId: admin.id,
    action: "C",
    entity: "user",
    entityId: newUser.id,
    summary: `创建用户：${newUser.email}（${newUser.name}）`,
    requestBody: JSON.stringify({ email: newUser.email, name: newUser.name, role: newUser.role, status: newUser.status }),
    responseBody: '{"result":"created"}',
  }).catch(() => {});

  return { ok: true as const, error: null, user: newUser };
}

/**
 * 更新用户 / Update user
 * - 可更新：用户名、邮箱、角色、状态、备注
 * - 密码修改走单独的 changePassword
 * - 写审计日志
 */
export async function updateUser(id: string, input: {
  name?: string;
  email?: string;
  role?: "admin" | "user";
  status?: "active" | "disabled";
  remark?: string | null;
}) {
  const admin = await requireAdmin();

  // 检查用户是否存在 / Check user exists
  const [oldUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!oldUser) {
    return { ok: false as const, error: "userMgmt.userNotFound" };
  }

  // 不能修改自己的角色为非 admin（防止锁死）/ Prevent self-demotion
  if (admin.id === id && input.role && input.role !== "admin") {
    return { ok: false as const, error: "userMgmt.cannotDemoteSelf" };
  }

  // 不能禁用自己（防止锁死）/ Prevent self-disable
  if (admin.id === id && input.status && input.status === "disabled") {
    return { ok: false as const, error: "userMgmt.cannotDisableSelf" };
  }

  // 校验邮箱 / Validate email
  let trimmedEmail: string | undefined;
  if (input.email !== undefined) {
    trimmedEmail = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return { ok: false as const, error: "userMgmt.emailInvalid" };
    }
    // 检查邮箱是否被其他用户占用 / Check email uniqueness
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmedEmail)).limit(1);
    if (existing && existing.id !== id) {
      return { ok: false as const, error: "userMgmt.emailExists" };
    }
  }

  // 校验用户名 / Validate name
  let trimmedName: string | undefined;
  if (input.name !== undefined) {
    trimmedName = input.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 30) {
      return { ok: false as const, error: "userMgmt.nameInvalid" };
    }
  }

  // 构建更新数据 / Build update data
  const updateData: Record<string, unknown> = {};
  if (trimmedName !== undefined) updateData.name = trimmedName;
  if (trimmedEmail !== undefined) updateData.email = trimmedEmail;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.remark !== undefined) updateData.remark = input.remark;

  // 更新用户 / Update user
  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  // 写审计日志 / Log audit
  await writeAudit({
    userId: admin.id,
    action: "U",
    entity: "user",
    entityId: id,
    summary: `更新用户：${oldUser.email}`,
    requestBody: JSON.stringify({ old: { name: oldUser.name, email: oldUser.email, role: oldUser.role, status: oldUser.status }, new: updateData }),
    responseBody: '{"result":"updated"}',
  }).catch(() => {});

  return { ok: true as const, error: null, user: updatedUser };
}

/**
 * 重置用户密码 / Reset user password
 * - 管理员可重置任意用户密码
 * - 写审计日志
 */
export async function resetUserPassword(id: string, newPassword: string) {
  const admin = await requireAdmin();

  // 校验密码长度 / Validate password length
  if (newPassword.length < 6 || newPassword.length > 72) {
    return { ok: false as const, error: "userMgmt.passwordLength" };
  }

  // 检查用户是否存在 / Check user exists
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    return { ok: false as const, error: "userMgmt.userNotFound" };
  }

  // 加密新密码 / Hash new password
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // 更新密码 / Update password
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));

  // 写审计日志 / Log audit
  await writeAudit({
    userId: admin.id,
    action: "U",
    entity: "user",
    entityId: id,
    summary: `重置用户密码：${user.email}`,
    requestBody: JSON.stringify({ email: user.email, reason: "admin_reset" }),
    responseBody: '{"result":"password_reset"}',
  }).catch(() => {});

  return { ok: true as const, error: null };
}

/**
 * 删除用户 / Delete user
 * - 不能删除自己（防止锁死）
 * - 写审计日志
 */
export async function deleteUser(id: string) {
  const admin = await requireAdmin();

  // 不能删除自己 / Prevent self-deletion
  if (admin.id === id) {
    return { ok: false as const, error: "userMgmt.cannotDeleteSelf" };
  }

  // 检查用户是否存在 / Check user exists
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    return { ok: false as const, error: "userMgmt.userNotFound" };
  }

  // 删除用户 / Delete user
  await db.delete(users).where(eq(users.id, id));

  // 写审计日志 / Log audit
  await writeAudit({
    userId: admin.id,
    action: "D",
    entity: "user",
    entityId: id,
    summary: `删除用户：${user.email}（${user.name}）`,
    requestBody: JSON.stringify({ email: user.email, name: user.name }),
    responseBody: '{"result":"deleted"}',
  }).catch(() => {});

  return { ok: true as const, error: null };
}
