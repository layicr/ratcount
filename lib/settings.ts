import { eq, and } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { settings } from "@/db/schema"
import { GLOBAL_USER_ID, SETTING_KEY, DEFAULT_LANGUAGE } from "@/lib/constants"
import { getMessages } from "next-intl/server";
import { localizedName } from "@/lib/localize";
import type { AppDict } from "@/i18n/dict";
import { cookies } from "next/headers";
import { normalizeTimeZone, DEFAULT_TIME_ZONE } from "@/i18n/timezones";
import { TIME_ZONE_COOKIE } from "@/lib/constants";

/**
 * 全局设置读取（settings 表，user_id = GLOBAL_USER_ID 为全局项）
 * 全局键：app_name / default_locale / allow_registration /
 *         enable_login_captcha / audit_log_retention_days / copyright
 * Global settings read (settings table; user_id = GLOBAL_USER_ID marks a global row)
 * Global keys: app_name / default_locale / allow_registration /
 *              enable_login_captcha / audit_log_retention_days / copyright
 */

export const getSetting = cache(async (key: string): Promise<string | null> => {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, GLOBAL_USER_ID), eq(settings.key, key)))
    .limit(1);
  return row?.value ?? null;
});

/** 设置表布尔值：文本列中代表「真」的字符串集合 / Truthy strings stored in the settings text column */
export const BOOL_TRUE_VALUES = ["true", "1"] as const;

/** 读取布尔设置 / Read a boolean setting */
export async function getBoolSetting(key: string, fallback = false): Promise<boolean> {
  const v = await getSetting(key);
  if (v == null) return fallback;
  return (BOOL_TRUE_VALUES as readonly string[]).includes(v);
}

/** 应用名静态兜底：取自环境变量 APP_NAME（默认 ratcount），与 messages 根级 appName 保持一致 / Static fallback sourced from APP_NAME env (default "ratcount"), matching the root appName message */
export const DEFAULT_APP_NAME = env.APP_NAME;

/**
 * 应用名加载顺序 / App name loading order:
 *   DB 全局设置 app_name（管理员可改，支持多语言对象 {"zh-CN":..,"en":..,"zh-TW":..}）→ 静态兜底 DEFAULT_APP_NAME
 * 数据库未就绪（表不存在 / 连接失败）时回退兜底，避免登录页 500；兼容旧单字符串值（存量库），解析失败时直接返回原串。
 * Falls back to a static default when the DB is unavailable (missing table / connection failure) to avoid a 500 on login; legacy single-string values are returned as-is on parse failure.
 */
export const getAppName = cache(async (locale: string): Promise<string> => {
  try {
    const stored = await getSetting(SETTING_KEY.appName);
    if (!stored) return DEFAULT_APP_NAME;
    // 旧单字符串（非 JSON）直接原样返回，兼容存量数据 / Legacy non-JSON string: return as-is for backward compatibility
    try {
      JSON.parse(stored);
    } catch {
      return stored;
    }
    return localizedName(stored, locale) || DEFAULT_APP_NAME;
  } catch {
    return DEFAULT_APP_NAME;
  }
});

/**
 * 应用宣言加载顺序 / App slogan loading order:
 *   DB 全局设置 app_slogan（管理员可改，支持多语言对象）→ messages 根级 tagline（随语言变化的静态兜底）
 * 数据库未就绪（表不存在 / 连接失败）或为空时，回退到 tagline，避免空白 / 500；兼容旧单字符串值（存量库），解析失败时直接返回原串。
 * Falls back to the locale tagline when the DB is unavailable/empty to avoid blank/500; legacy single-string values are returned as-is on parse failure.
 */
export const getAppSlogan = cache(async (locale: string): Promise<string> => {
  let dbVal: string | null = null;
  try {
    dbVal = await getSetting(SETTING_KEY.appSlogan);
  } catch {
    dbVal = null; // DB 不可用时回退静态兜底 / fall back to static default on DB failure
  }
  if (dbVal) {
    // 新版：多语言对象 {"zh-CN":..,"en":..,"zh-TW":..} / New format: multilingual object
    if (dbVal.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(dbVal) as Record<string, string>;
        const v = obj[locale] || obj[DEFAULT_LANGUAGE] || Object.values(obj).find((x) => x?.trim());
        if (v) return v;
      } catch {
        return dbVal; // 旧单字符串：解析失败直接返回 / legacy single string: return as-is on parse failure
      }
    } else {
      return dbVal; // 旧单字符串 / legacy single string
    }
  }
  // 静态兜底：messages 根级 tagline（随语言）/ Static fallback: locale tagline from messages
  try {
    const messages = (await getMessages()) as unknown as AppDict;
    return messages.tagline ?? "";
  } catch {
    return "";
  }
});

/**
 * 时区加载顺序 / Time zone loading order:
 *   1) 用户 cookie `money_timezone`（用户偏好，最高优先）
 *   2) 全局设置 default_timezone（后台可运营；DB 不足时回退静态 DEFAULT_TIME_ZONE）
 *   3) 静态兜底 DEFAULT_TIME_ZONE（"Asia/Shanghai"）
 * 数据库未就绪（表不存在 / 连接失败）或无 cookie 时逐级回退，保证界面不 500。
 *   1) User cookie `money_timezone` (highest priority)
 *   2) Global setting default_timezone (operator-managed; static DEFAULT_TIME_ZONE when DB is short)
 *   3) Static fallback DEFAULT_TIME_ZONE ("Asia/Shanghai")
 * Falls back step by step when the DB is unavailable or no cookie exists, so the UI never 500s.
 */
export async function getResolvedTimeZone(): Promise<string> {
  // 1) 用户 cookie（用户偏好）/ User cookie (preference)
  try {
    const store = await cookies();
    const v = store.get(TIME_ZONE_COOKIE)?.value;
    if (v && normalizeTimeZone(v) === v) return v;
  } catch {
    /* 非请求上下文（如静态生成），忽略后走后续回退 / Non-request context (e.g. static generation); skip and continue */
  }
  // 2) 全局默认时区（DB，带校验）/ Global default time zone (DB, validated)
  try {
    const dbVal = await getSetting(SETTING_KEY.defaultTimezone);
    if (dbVal && normalizeTimeZone(dbVal) === dbVal) return dbVal;
  } catch {
    /* DB 不可用时忽略，继续静态兜底 / Ignore on DB failure, continue to static fallback */
  }
  // 3) 静态兜底 / Static fallback
  return DEFAULT_TIME_ZONE;
}

/** 读取全部全局设置 / Read all global settings */
export const getAllSettings = cache(async () => db.select().from(settings).where(eq(settings.userId, GLOBAL_USER_ID)));

/** 读取用户级设置（userId 维度）/ Read a per-user setting (by userId) */
export const getSettingForUser = cache(async (userId: string, key: string): Promise<string | null> => {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .limit(1);
  return row?.value ?? null;
});
