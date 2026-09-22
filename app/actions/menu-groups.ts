"use server";

// 薄封装：分组读操作保留（需 requireUser），写操作改调 lib/services/menus + revalidatePath（Next 专属）
import { revalidatePath } from "next/cache";
import { menuGroups } from "@/db/schema";
import { type MenuDeviceType, SETTINGS_MENU_GROUPS_PATH } from "@/lib/constants";
import { requireUser, requireAdmin } from "@/lib/scope";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  createMenuGroupService, updateMenuGroupService, deleteMenuGroupService,
  type MenuGroupInput,
} from "@/lib/services/menus";

export type { MenuGroupInput };

/** 查询全部分组 */
export async function getAllMenuGroups() {
  await requireUser();
  return db.select().from(menuGroups).orderBy(asc(menuGroups.sort));
}

/** 查询全部分组，供导航构建使用 */
export async function getMenuGroupsForNav() {
  await requireUser();
  return db.select().from(menuGroups).orderBy(asc(menuGroups.sort));
}

/** 按设备查询全部分组（设备过滤由 menus.device_type 承担） */
export async function getMenuGroupsByDevice(_deviceType: MenuDeviceType) {
  await requireUser();
  return db.select().from(menuGroups).orderBy(asc(menuGroups.sort));
}

/** 新增分组 */
export async function createMenuGroup(input: MenuGroupInput) {
  const user = await requireAdmin();
  const res = await createMenuGroupService({ id: user.id }, input);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENU_GROUPS_PATH);
  }
  return res;
}

/** 编辑分组（menu_group_id 不可改） */
export async function updateMenuGroup(menuGroupId: string, input: Omit<MenuGroupInput, "menuGroupId">) {
  const user = await requireAdmin();
  const res = await updateMenuGroupService({ id: user.id }, menuGroupId, input);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENU_GROUPS_PATH);
  }
  return res;
}

/** 删除分组（组下仍有菜单时拒绝） */
export async function deleteMenuGroup(menuGroupId: string) {
  const user = await requireAdmin();
  const res = await deleteMenuGroupService({ id: user.id }, menuGroupId);
  if (res.ok) {
    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_MENU_GROUPS_PATH);
  }
  return res;
}
