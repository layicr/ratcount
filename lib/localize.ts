import { locales as staticLocales, DEFAULT_LOCALE, localeLabels as staticLocaleLabels, type AppLocale } from "@/i18n/routing";
import { z } from "zod";

/** i18n 语言码别名（与 AppLocale 对齐，替代已删除的 lib/i18n.ts shim 类型）/ i18n locale-code alias (aligns with AppLocale; replaces the removed lib/i18n.ts shim type) */
type Locale = AppLocale;

/**
 * 多语言名称原语（客户端安全：仅类型导入 lib/i18n，不引入 next/headers / db）。
 * 菜单 / 分组等 DB 存储的展示名统一走这里；新增语言只需扩展 locales 与 messages。
 * Localized-name primitives (client-safe: only imports the lib/i18n type, never next/headers / db).
 * Display names stored in DB for menus/groups all go through here; adding a language only needs locales + messages.
 */

/**
 * 支持的语言列表（客户端静态回退；运行期以 languages 表为准，见 lib/languages.ts）。
 * 单一来源：i18n/routing.ts 的 locales 常量（next-intl 静态超集）。
 * Supported locale list (client static fallback; at runtime the languages table wins — see lib/languages.ts).
 * Single source: the locales constant in i18n/routing.ts (next-intl static superset).
 */
export const locales: Locale[] = [...staticLocales];

/** 默认语言（与 languages 表 is_default 对齐；此处为静态回退；单一来源：i18n/routing.ts）/ Default locale (aligned with languages.is_default; this is the static fallback; single source: i18n/routing.ts) */
export const defaultLocale: Locale = DEFAULT_LOCALE; // "zh-CN"

/** 多语言名称：各 locale → 文案（至少含默认语言）/ Localized name: locale → text (at least the default locale) */
export type LocalizedName = Partial<Record<Locale, string>>;

/** 各语言展示标签（单一来源：i18n/routing.ts）/ Per-locale display labels (single source: i18n/routing.ts) */
export const localeLabels: Record<Locale, string> = { ...staticLocaleLabels };

/**
 * 从多语言名称取当前语言的值。
 * 兼容入参为 JSON 字符串（DB 存储）或已解析对象（表单 / 内存）。
 * 取值优先级：locale > defaultLocale > ""（空串由调用方回退 t(key)）。
 * Read the value for the current locale from a localized name.
 * Accepts either a JSON string (DB storage) or an already-parsed object (form / memory).
 * Precedence: locale > defaultLocale > "" (empty yields to the caller's t(key) fallback).
 */
export function localizedName(name: unknown, locale: string): string {
  let obj: LocalizedName = {};
  if (typeof name === "string") {
    if (!name) return "";
    try {
      const parsed: unknown = JSON.parse(name);
      if (parsed && typeof parsed === "object") obj = parsed as LocalizedName;
    } catch {
      obj = {};
    }
  } else if (name && typeof name === "object") {
    obj = name as LocalizedName;
  }
  return obj[locale as Locale] || obj[defaultLocale] || "";
}

/**
 * 多语言名称校验（zod）。键为任意 locale 字符串（随 locales 扩展自动兼容），
 * 值最多 50 字；至少默认语言（zh）必填，缺失时报 common.nameRequired。
 * Localized-name validation (zod). Keys are any locale string (auto-compatible as locales grow);
 * values are ≤50 chars; the default locale (zh) is required, else common.nameRequired.
 */
export const localizedNameSchema = z
  .record(z.string(), z.string().max(50))
  .refine((d) => (d[defaultLocale] ?? "").trim().length > 0, {
    message: "common.nameRequired",
  });
