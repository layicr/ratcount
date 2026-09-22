// ratcount · 用户管理 业务服务 / User management business services
//  - 从 app/actions/users.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie）。
//  - 桌面端创建首个本地用户也复用 createUserService。
import { ledgerMembers, userProfiles, userMenuConfig, settings, users } from "@/db/schema";
import { type UserRole, type UserStatus, ROLE, AUDIT_ACTION, ENTITY, USER_STATUS } from "@/lib/constants";
import { db } from "@/lib/db";
import { writeAudit, withAudit } from "@/lib/audit";
import { cascadeDeleteLedger } from "@/lib/cascade";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { type Actor } from "./guard";

const BCRYPT_COST = 12; // bcrypt cost（安全与性能平衡值）

export type CreateUserInput = {
  name: string; email: string; password: string;
  role: UserRole; status: UserStatus; remark?: string;
};
export type UpdateUserInput = {
  name?: string; email?: string; role?: UserRole; status?: UserStatus; remark?: string | null;
};

/* ===================== 创建用户 / Create ===================== */

export async function createUserService(actor: Actor, input: CreateUserInput) {
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim().toLowerCase();

  if (trimmedName.length < 1 || trimmedName.length > 30) return { ok: false as const, error: "userMgmt.nameInvalid" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return { ok: false as const, error: "userMgmt.emailInvalid" };
  if (input.password.length < 6 || input.password.length > 72) return { ok: false as const, error: "userMgmt.passwordLength" };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmedEmail)).limit(1);
  if (existing) return { ok: false as const, error: "userMgmt.emailExists" };

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const [newUser] = await db.insert(users).values({
    name: trimmedName, email: trimmedEmail, passwordHash,
    role: input.role, status: input.status, remark: input.remark ?? null,
  }).returning();

  await writeAudit({
    userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.user, entityId: newUser.id,
    summaryKey: "audit.userCreated", summaryParams: { email: newUser.email, name: newUser.name },
    requestBody: JSON.stringify({ email: newUser.email, name: newUser.name, role: newUser.role, status: newUser.status }),
    responseBody: '{"result":"created"}',
  });

  return { ok: true as const, error: null, user: newUser };
}

/* ===================== 更新用户 / Update ===================== */

export async function updateUserService(actor: Actor, id: string, input: UpdateUserInput) {
  const [oldUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!oldUser) return { ok: false as const, error: "userMgmt.userNotFound" };

  // 不能修改自己的角色为非 admin（防止锁死）
  if (actor.id === id && input.role && input.role !== ROLE.admin) return { ok: false as const, error: "userMgmt.cannotDemoteSelf" };
  // 不能禁用自己（防止锁死）
  if (actor.id === id && input.status && input.status === USER_STATUS.disabled) return { ok: false as const, error: "userMgmt.cannotDisableSelf" };

  let trimmedEmail: string | undefined;
  if (input.email !== undefined) {
    trimmedEmail = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return { ok: false as const, error: "userMgmt.emailInvalid" };
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmedEmail)).limit(1);
    if (existing && existing.id !== id) return { ok: false as const, error: "userMgmt.emailExists" };
  }

  let trimmedName: string | undefined;
  if (input.name !== undefined) {
    trimmedName = input.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 30) return { ok: false as const, error: "userMgmt.nameInvalid" };
  }

  const updateData: Record<string, unknown> = {};
  if (trimmedName !== undefined) updateData.name = trimmedName;
  if (trimmedEmail !== undefined) updateData.email = trimmedEmail;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.remark !== undefined) updateData.remark = input.remark;
  // 禁用 / 角色变更：自增会话版本，使该用户已签发的 JWT 立即失效
  if (
    (input.status !== undefined && input.status !== oldUser.status) ||
    (input.role !== undefined && input.role !== oldUser.role)
  ) {
    updateData.tokenVersion = (oldUser.tokenVersion ?? 0) + 1;
  }

  const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

  await writeAudit({
    userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.user, entityId: id,
    summaryKey: "audit.userUpdated", summaryParams: { email: oldUser.email },
    requestBody: JSON.stringify({ old: { name: oldUser.name, email: oldUser.email, role: oldUser.role, status: oldUser.status }, new: updateData }),
    responseBody: '{"result":"updated"}',
  });

  return { ok: true as const, error: null, user: updatedUser };
}

/* ===================== 重置密码 / Reset password ===================== */

export async function resetUserPasswordService(actor: Actor, id: string, newPassword: string) {
  if (newPassword.length < 6 || newPassword.length > 72) return { ok: false as const, error: "userMgmt.passwordLength" };

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return { ok: false as const, error: "userMgmt.userNotFound" };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.user, entityId: id,
      summaryKey: "audit.userPasswordReset", summaryParams: { email: user.email },
      requestBody: JSON.stringify({ email: user.email, reason: "admin_reset" }),
      responseBody: '{"result":"password_reset"}',
    },
    async (tx) => {
      await tx.update(users).set({ passwordHash, tokenVersion: (user.tokenVersion ?? 0) + 1 }).where(eq(users.id, id));
    },
  );
  return { ok: true as const, error: null };
}

/* ===================== 删除用户 / Delete ===================== */

export async function deleteUserService(actor: Actor, id: string) {
  // 不能删除自己（防止锁死）
  if (actor.id === id) return { ok: false as const, error: "userMgmt.cannotDeleteSelf" };

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return { ok: false as const, error: "userMgmt.userNotFound" };

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.user, entityId: id,
      summaryKey: "audit.userDeleted", summaryParams: { email: user.email, name: user.name },
      requestBody: JSON.stringify({ email: user.email, name: user.name }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      // 1) 取出该用户所属账本，再移除其全部成员关系
      const members = await tx.select({ ledgerId: ledgerMembers.ledgerId }).from(ledgerMembers).where(eq(ledgerMembers.userId, id));
      await tx.delete(ledgerMembers).where(eq(ledgerMembers.userId, id));

      // 2) 移除成员后已无任何成员的账本 = 该用户独有的账本，级联删除其全部数据
      const ledgerIds = members.map((m) => m.ledgerId);
      const remainingRows = ledgerIds.length
        ? await tx.select({ ledgerId: ledgerMembers.ledgerId }).from(ledgerMembers).where(inArray(ledgerMembers.ledgerId, ledgerIds)).groupBy(ledgerMembers.ledgerId)
        : [];
      const stillHasMembers = new Set(remainingRows.map((r) => r.ledgerId));
      for (const ledgerId of ledgerIds) {
        if (!stillHasMembers.has(ledgerId)) await cascadeDeleteLedger(tx, ledgerId);
      }

      // 3) 删除该用户的私有数据（画像 / 菜单配置 / 用户级设置）
      await tx.delete(userProfiles).where(eq(userProfiles.userId, id));
      await tx.delete(userMenuConfig).where(eq(userMenuConfig.userId, id));
      await tx.delete(settings).where(eq(settings.userId, id)); // 仅用户级设置，不动全局(global)

      // 4) 删除用户本体（审计日志匿名化保留，不物理删除）
      await tx.delete(users).where(eq(users.id, id));
    },
  );
  return { ok: true as const, error: null };
}
