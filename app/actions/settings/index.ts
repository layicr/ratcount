"use server";

// ratcount · 全局设置写操作（薄封装）/ Global settings writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/settings；此处仅做「守卫 + revalidatePath」，服务端行为零回归。
import { LOGIN_PATH, SETTINGS_PATH } from "@/lib/constants";
import { requireAdmin } from "@/lib/scope";
import * as svc from "@/lib/services/settings";
import { revalidatePath } from "next/cache";

export async function updateSetting(key: string, value: string) {
  const user = await requireAdmin();
  const r = await svc.updateSettingService({ id: user.id, role: user.role }, key, value);
  if (r.ok) {
    revalidatePath(SETTINGS_PATH);
    revalidatePath(LOGIN_PATH);
  }
  return r;
}
