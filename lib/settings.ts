import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/db/schema";

/**
 * 全局设置读取（settings 表，user_id = 'global' 为全局项）
 * 全局键：app_name / default_locale / allow_registration /
 *         enable_login_captcha / audit_log_retention_days / copyright
 */
const GLOBAL = "global";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, GLOBAL), eq(settings.key, key)))
    .limit(1);
  return row?.value ?? null;
}

/** 读取布尔设置 / Read boolean setting */
export async function getBoolSetting(key: string, fallback = false): Promise<boolean> {
  const v = await getSetting(key);
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

/** 读取全部全局设置 / Read all global settings */
export async function getAllSettings() {
  return db.select().from(settings).where(eq(settings.userId, GLOBAL));
}

/** 读取用户级设置（userId 维度）/ Read a per-user setting */
export async function getSettingForUser(userId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .limit(1);
  return row?.value ?? null;
}
