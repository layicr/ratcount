// ratcount · 菜单/分组 业务服务 / Menu & menu-group business services
//  - 从 app/actions/menu-groups.ts、app/actions/menus.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie）。
import { menuGroups, userMenuConfig, menus } from "@/db/schema";
import { menuDeviceTypes, menuStatusCodes, type MenuDeviceType, type MenuStatusCode, AUDIT_ACTION, MENU_STATUS, ENTITY } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { localizedName, localizedNameSchema, defaultLocale } from "@/lib/localize";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { type Actor } from "./guard";

/** 分组入参校验 */
const menuGroupSchema = z.object({
  menuGroupId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/, "menuMgmt.invalidGroupId"),
  name: localizedNameSchema,
  sort: z.number().int().min(0).max(9999).optional(),
  remark: z.string().max(200).nullable().optional(),
});

export type MenuGroupInput = z.infer<typeof menuGroupSchema>;

/** 菜单入参校验 */
const menuSchema = z.object({
  menuId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/, "menuMgmt.invalidId"),
  name: localizedNameSchema,
  icon: z.string().min(1).max(8),
  menuGroupId: z.string().min(1).max(64),
  sort: z.number().int().min(0).max(9999).optional(),
  statusCode: z.enum(menuStatusCodes),
  deviceType: z.enum(menuDeviceTypes),
  link: z.string().min(1).max(200).refine((v) => v.startsWith("/") && !v.startsWith("//"), "menuMgmt.invalidLink"),
  remark: z.string().max(200).nullable().optional(),
});

export type MenuInput = z.infer<typeof menuSchema>;

/** 校验 menu_group_id 是否存在（数据驱动，允许动态新增分组） */
async function assertMenuGroupExists(menuGroupId: string) {
  const [g] = await db.select({ menuGroupId: menuGroups.menuGroupId }).from(menuGroups).where(eq(menuGroups.menuGroupId, menuGroupId)).limit(1);
  if (!g) throw new Error("menuMgmt.groupNotFound");
}

/** 事务类型 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 把菜单并入所有已存在的用户白名单（幂等） */
async function syncMenuToWhitelists(tx: Tx, menuId: string) {
  const pairs = await tx.selectDistinct({ ledgerId: userMenuConfig.ledgerId, userId: userMenuConfig.userId }).from(userMenuConfig);
  if (pairs.length === 0) return;
  await tx.insert(userMenuConfig).values(pairs.map((p) => ({ ledgerId: p.ledgerId, userId: p.userId, menuId }))).onConflictDoNothing();
}

/* ===================== 分组 / Menu groups ===================== */

export async function createMenuGroupService(actor: Actor, input: MenuGroupInput) {
  const parsed = menuGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errors.invalidInput" };
  const d = parsed.data;

  const [existing] = await db.select().from(menuGroups).where(eq(menuGroups.menuGroupId, d.menuGroupId)).limit(1);
  if (existing) return { ok: false as const, error: "menuMgmt.groupExists" };

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.menuGroup, entityId: d.menuGroupId,
      summaryKey: "audit.menuGroupCreated", summaryParams: { name: localizedName(d.name, defaultLocale), menuGroupId: d.menuGroupId },
      requestBody: JSON.stringify(d), responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(menuGroups).values({ menuGroupId: d.menuGroupId, name: JSON.stringify(d.name), sort: d.sort ?? 0, remark: d.remark ?? null });
    },
  );
  return { ok: true as const, error: null };
}

export async function updateMenuGroupService(actor: Actor, menuGroupId: string, input: Omit<MenuGroupInput, "menuGroupId">) {
  const parsed = menuGroupSchema.omit({ menuGroupId: true }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errors.invalidInput" };
  const d = parsed.data;

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.menuGroup, entityId: menuGroupId,
      summaryKey: "audit.menuGroupUpdated", summaryParams: { name: localizedName(d.name, defaultLocale), menuGroupId },
      requestBody: JSON.stringify({ menuGroupId, ...d }), responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(menuGroups).set({ name: JSON.stringify(d.name), sort: d.sort ?? 0, remark: d.remark ?? null }).where(eq(menuGroups.menuGroupId, menuGroupId));
    },
  );
  return { ok: true as const, error: null };
}

export async function deleteMenuGroupService(actor: Actor, menuGroupId: string) {
  const [g] = await db.select().from(menuGroups).where(eq(menuGroups.menuGroupId, menuGroupId)).limit(1);
  if (!g) return { ok: false as const, error: "menuMgmt.groupNotFound" };

  const [used] = await db.select({ menuId: menus.menuId }).from(menus).where(eq(menus.menuGroupId, menuGroupId)).limit(1);
  if (used) return { ok: false as const, error: "menuMgmt.groupInUse" };

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.menuGroup, entityId: menuGroupId,
      summaryKey: "audit.menuGroupDeleted", summaryParams: { name: localizedName(g.name, defaultLocale), menuGroupId },
      requestBody: JSON.stringify({ menuGroupId }), responseBody: '{"result":"deleted"}',
    },
    async (tx) => { await tx.delete(menuGroups).where(eq(menuGroups.menuGroupId, menuGroupId)); },
  );
  return { ok: true as const, error: null };
}

/* ===================== 菜单 / Menus ===================== */

export async function createMenuService(actor: Actor, input: MenuInput, syncUsers = false) {
  const parsed = menuSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errors.invalidInput" };
  const d = parsed.data;

  const [existing] = await db.select().from(menus).where(eq(menus.menuId, d.menuId)).limit(1);
  if (existing) return { ok: false as const, error: "menuMgmt.menuExists" };

  try {
    await assertMenuGroupExists(d.menuGroupId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "menuMgmt.groupNotFound" };
  }

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.menu, entityId: d.menuId,
      summaryKey: "audit.menuCreated", summaryParams: { name: localizedName(d.name, defaultLocale), menuId: d.menuId },
      requestBody: JSON.stringify(d), responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(menus).values({
        menuId: d.menuId, name: JSON.stringify(d.name), icon: d.icon,
        menuGroupId: d.menuGroupId, sort: d.sort ?? 0, statusCode: d.statusCode as MenuStatusCode,
        deviceType: d.deviceType as MenuDeviceType, link: d.link, remark: d.remark ?? null,
      });
      if (syncUsers && d.statusCode === MENU_STATUS.active) await syncMenuToWhitelists(tx, d.menuId);
    },
  );
  return { ok: true as const, error: null };
}

export async function updateMenuService(actor: Actor, menuId: string, input: Omit<MenuInput, "menuId">, syncUsers = false) {
  const parsed = menuSchema.omit({ menuId: true }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errors.invalidInput" };
  const d = parsed.data;

  try {
    await assertMenuGroupExists(d.menuGroupId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "menuMgmt.groupNotFound" };
  }

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.menu, entityId: menuId,
      summaryKey: "audit.menuUpdated", summaryParams: { name: localizedName(d.name, defaultLocale), menuId },
      requestBody: JSON.stringify({ menuId, ...d }), responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(menus).set({
        name: JSON.stringify(d.name), icon: d.icon, menuGroupId: d.menuGroupId, sort: d.sort ?? 0,
        statusCode: d.statusCode as MenuStatusCode, deviceType: d.deviceType as MenuDeviceType,
        link: d.link, remark: d.remark ?? null,
      }).where(eq(menus.menuId, menuId));
      if (syncUsers && d.statusCode === MENU_STATUS.active) await syncMenuToWhitelists(tx, menuId);
    },
  );
  return { ok: true as const, error: null };
}

export async function deleteMenuService(actor: Actor, menuId: string) {
  const [menu] = await db.select().from(menus).where(eq(menus.menuId, menuId)).limit(1);
  if (!menu) return { ok: false as const, error: "menuMgmt.menuNotFound" };

  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.menu, entityId: menuId,
      summaryKey: "audit.menuDeleted", summaryParams: { name: localizedName(menu.name, defaultLocale), menuId },
      requestBody: JSON.stringify({ menuId }), responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx.delete(userMenuConfig).where(eq(userMenuConfig.menuId, menuId));
      await tx.delete(menus).where(eq(menus.menuId, menuId));
    },
  );
  return { ok: true as const, error: null };
}
