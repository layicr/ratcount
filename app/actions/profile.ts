"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/scope";
import { writeAudit } from "@/lib/audit";

const BCRYPT_COST = 12; // bcrypt cost（安全与性能平衡值）

/**
 * 更新用户名 / Update user name
 * - 校验：名称 1-30 字符
 * - 写审计日志
 */
export async function updateUserName(name: string) {
  const user = await requireUser();

  // 校验名称长度 / Validate name length
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) {
    return { ok: false as const, error: "profile.nameInvalid" };
  }

  await writeAudit({
    userId: user.id,
    action: "U",
    entity: "user",
    entityId: user.id,
    summary: `更新用户名：${user.name} → ${trimmed}`,
    requestBody: JSON.stringify({ oldName: user.name, newName: trimmed }),
    responseBody: '{"result":"updated"}',
  }).catch(() => {});

  await db.update(users).set({ name: trimmed }).where(eq(users.id, user.id));

  return { ok: true as const, error: null };
}

/**
 * 修改密码 / Change password
 * - 校验：旧密码正确、新密码 6-72 字符、新旧密码不同
 * - bcrypt 加密新密码（cost=12）
 * - 写审计日志
 */
export async function changePassword(oldPassword: string, newPassword: string) {
  const user = await requireUser();

  // 校验新密码长度 / Validate new password length
  if (newPassword.length < 6 || newPassword.length > 72) {
    return { ok: false as const, error: "profile.passwordLength" };
  }

  // 校验新旧密码不同 / Validate new password differs from old
  if (oldPassword === newPassword) {
    return { ok: false as const, error: "profile.passwordSame" };
  }

  // 验证旧密码 / Verify old password
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!dbUser) {
    return { ok: false as const, error: "profile.userNotFound" };
  }

  const oldOk = await bcrypt.compare(oldPassword, dbUser.passwordHash);
  if (!oldOk) {
    // 写失败审计日志 / Log failed attempt
    await writeAudit({
      userId: user.id,
      action: "U",
      entity: "user",
      entityId: user.id,
      summary: "修改密码失败：旧密码错误",
      requestBody: JSON.stringify({ reason: "old_password_incorrect" }),
      responseBody: '{"result":"failed"}',
    }).catch(() => {});
    return { ok: false as const, error: "profile.oldPasswordWrong" };
  }

  // 加密新密码 / Hash new password
  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // 写成功审计日志 / Log success
  await writeAudit({
    userId: user.id,
    action: "U",
    entity: "user",
    entityId: user.id,
    summary: "修改密码成功",
    requestBody: JSON.stringify({ reason: "password_changed" }),
    responseBody: '{"result":"changed"}',
  }).catch(() => {});

  // 更新数据库 / Update database
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

  return { ok: true as const, error: null };
}
