"use server";

// 薄封装：菜单读操作保留（需 requireUser），写操作改调 lib/services/menus + revalidatePath（Next 专属）
import { revalidatePath } from "next/cache";
import { menus } from "@/db/schema";
import { menuDeviceTypes, type MenuDeviceType, MENU_STATUS, SETTINGS_MENUS_PATH } from "@/lib/constants";
import { requireUser, requireAdmin } from "@/lib/scope";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  createMenuService, updateMenuService, deleteMenuService, type MenuInput,
} from "@/lib/services/menus";

export type { MenuInput };

/** 查询全部菜单（admin 管理端用） */
export async function getAllMenus() {
  await requireUser();
  return db.select().from(menus).orderBy(asc(menus.menuGroupId), asc(menus.sort));
}

/** 查询全部 active 菜单（导航渲染 / 我的菜单页用） */
export async function getActiveMenus() {
  await requireUser();
  return db.select().from(menus).where(eq(menus.statusCode, MENU_STATUS.active)).orderBy(asc(menus.sort));
}

/** 按设备类型查询 active 菜单 */
export async function getMenusByDevice(deviceType: MenuDeviceType) {
  await requireUser();
  return db
    .select()
    .from(menus)
    .where(and(eq(menus.statusCode, MENU_STATUS.active), eq(menus.deviceType, deviceType)))
    .orderBy(asc(menus.sort));
}

/** 新增菜单 */
export async function createMenu(input: MenuInput, syncUsers = false) {
  const user = await requireAdmin();
  const res = await createMenuService({ id: user.id }, input, syncUsers);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENUS_PATH);
  }
  return res;
}

/** 编辑菜单（menu_id 不可改） */
export async function updateMenu(menuId: string, input: Omit<MenuInput, "menuId">, syncUsers = false) {
  const user = await requireAdmin();
  const res = await updateMenuService({ id: user.id }, menuId, input, syncUsers);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENUS_PATH);
  }
  return res;
}

/** 删除菜单：一并清理用户白名单中对该菜单的引用 */
export async function deleteMenu(menuId: string) {
  const user = await requireAdmin();
  const res = await deleteMenuService({ id: user.id }, menuId);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENUS_PATH);
  }
  return res;
}
