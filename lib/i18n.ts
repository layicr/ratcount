import { cookies } from "next/headers";
import zh from "@/messages/zh.json";
import en from "@/messages/en.json";
import { getSetting } from "@/lib/settings";

/**
 * ratcount · i18n 运行时
 *  - 语言存储：cookie `ratcount_locale`（zh | en）
 *  - 优先级：用户个人设置(cookie) > 全局默认语言(default_locale) > 中文(zh)
 *  - 服务端：getLocale() / getDictionary(locale)
 *  - 客户端：<I18nProvider> + useT()（见 components/i18n-provider.tsx）
 */

export type Locale = "zh" | "en";
export const locales: Locale[] = ["zh", "en"];
export const defaultLocale: Locale = "zh";

const dictionaries = { zh, en } as const;
export type Dict = (typeof dictionaries)["zh"];

/** 获取指定语言字典 / Get dictionary for a locale */
export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale];
}

/**
 * 服务端读当前语言
 * 优先级：用户个人设置(cookie ratcount_locale) > 全局默认语言(settings.default_locale) > 中文(zh)
 * 重新登录后，若用户未设置过个人语言，则使用全局默认语言
 */
export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const v = store.get("ratcount_locale")?.value;
    // 用户有个人语言设置，优先使用 / User has personal locale preference
    if (v === "en" || v === "zh") return v;
  } catch {
    // 非请求上下文，继续读全局设置 / Fall through to global setting
  }

  try {
    // 读取全局默认语言 / Read global default locale
    const globalLocale = await getSetting("default_locale");
    if (globalLocale === "en" || globalLocale === "zh") return globalLocale;
  } catch {
    // 数据库未就绪或查询失败，回退默认 / DB not ready, fall back
  }

  return defaultLocale;
}
