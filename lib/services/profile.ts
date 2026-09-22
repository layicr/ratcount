// ratcount · 个人资料 / 偏好 / 菜单配置 业务服务 / Profile, preferences & menu-config business services
//  - 从 app/actions/profile|user-preferences|user-menu 抽出的写逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { menus, userMenuConfig, userProfiles, users } from "@/db/schema";
import { AUDIT_ACTION, ENTITY, MENU_STATUS } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit, writeAudit } from "@/lib/audit";
import { type Actor } from "./guard";

const BCRYPT_COST = 12;

/* ===================== 个人资料 / Profile ===================== */

/** 更新用户名 / Update user name */
export async function updateUserNameService(actor: Actor, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) return { ok: false as const, error: "profile.nameInvalid" };
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.user,
      entityId: actor.id,
      summaryKey: "audit.profileNameUpdated",
      summaryParams: { old: actor.name ?? "", new: trimmed },
      requestBody: JSON.stringify({ oldName: actor.name, newName: trimmed }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => { await tx.update(users).set({ name: trimmed }).where(eq(users.id, actor.id)); },
  );
  return { ok: true as const, error: null };
}

/** 修改密码 / Change password */
export async function changePasswordService(actor: Actor, oldPassword: string, newPassword: string) {
  if (newPassword.length < 6 || newPassword.length > 72) return { ok: false as const, error: "profile.passwordLength" };
  if (oldPassword === newPassword) return { ok: false as const, error: "profile.passwordSame" };

  const [dbUser] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!dbUser) return { ok: false as const, error: "profile.userNotFound" };

  const oldOk = await bcrypt.compare(oldPassword, dbUser.passwordHash);
  if (!oldOk) {
    await writeAudit({
      userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.user, entityId: actor.id,
      summaryKey: "audit.profilePasswordFail", summaryParams: {},
      requestBody: JSON.stringify({ reason: "old_password_incorrect" }), responseBody: '{"result":"failed"}',
    });
    return { ok: false as const, error: "profile.oldPasswordWrong" };
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.user, entityId: actor.id,
      summaryKey: "audit.profilePasswordOk", summaryParams: {},
      requestBody: JSON.stringify({ reason: "password_changed" }), responseBody: '{"result":"changed"}',
    },
    async (tx) => {
      await tx.update(users).set({ passwordHash: newHash, tokenVersion: (dbUser.tokenVersion ?? 0) + 1 }).where(eq(users.id, actor.id));
    },
  );
  return { ok: true as const, error: null };
}

/* ===================== 用户偏好（无审计，upsert） ===================== */

export type UserPreferenceInput = {
  themeCode?: string | null;
  localeCode?: string | null;
  timezoneCode?: string | null;
  bio?: string | null;
};

/** upsert 用户扩展偏好 / Upsert user extended preferences */
export async function updateUserPreferencesService(actor: Actor, input: UserPreferenceInput) {
  const now = new Date().toISOString();
  const set: Record<string, unknown> = { updatedAt: now };
  if (input.themeCode !== undefined) set.themeCode = input.themeCode;
  if (input.localeCode !== undefined) set.localeCode = input.localeCode;
  if (input.timezoneCode !== undefined) set.timezoneCode = input.timezoneCode;
  if (input.bio !== undefined) set.bio = input.bio;

  await db
    .insert(userProfiles)
    .values({
      userId: actor.id,
      themeCode: input.themeCode ?? null,
      localeCode: input.localeCode ?? null,
      timezoneCode: input.timezoneCode ?? null,
      bio: input.bio ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: userProfiles.userId, set });

  return { ok: true as const };
}

/* ===================== 我的菜单显隐配置 ===================== */

/** 保存当前用户在当前账本的菜单显隐配置（数据驱动版）/ Save ledger menu visibility config */
export async function saveLedgerMenuService(actor: Actor, ledgerId: string, menuIds: string[]) {
  // 白名单：仅保留 menus 表中 active 的 menu_id（防越权/脏数据）
  const allowed = await db.select({ menuId: menus.menuId }).from(menus).where(eq(menus.statusCode, MENU_STATUS.active));
  const allowedSet = new Set(allowed.map((a) => a.menuId));
  const cleaned = Array.isArray(menuIds)
    ? [...new Set(menuIds)].filter((id) => typeof id === "string" && allowedSet.has(id))
    : [];

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.userMenu,
      entityId: ledgerId,
      summaryKey: "audit.userMenuUpdated",
      summaryParams: { count: cleaned.length },
      requestBody: JSON.stringify({ enabled: cleaned }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.delete(userMenuConfig).where(and(eq(userMenuConfig.ledgerId, ledgerId), eq(userMenuConfig.userId, actor.id)));
      if (cleaned.length > 0) {
        await tx.insert(userMenuConfig).values(cleaned.map((menuId) => ({ ledgerId, userId: actor.id, menuId })));
      }
    },
  );
  return { ok: true as const, error: null };
}
