import { getRequestConfig } from "next-intl/server";
import { routing, type AppLocale } from "./routing";
import { getMergedDict } from "./dict";
import { getResolvedLocale } from "@/lib/languages";
import { getResolvedTimeZone } from "@/lib/settings";

/**
 * 每个请求解析 locale + 时区 + 加载对应 messages。
 * 语言加载顺序（与 readLocale / getResolvedLocale 一致）：
 *   next-intl requestLocale（middleware header，本项目通常为 undefined）
 *   → 用户 cookie `money_locale` → languages 表默认语言 → 静态 DEFAULT_LOCALE（见 getResolvedLocale）
 * 时区加载顺序（见 getResolvedTimeZone）：cookie `money_timezone` → 全局设置 default_timezone → 静态 DEFAULT_TIME_ZONE。
 * 注：本项目 middleware 为自定义 cookie 校验（不 rewrite），不会设置 next-intl locale header，
 *   因此 requestLocale 通常为 undefined，语言以 cookie 直读为准（统一委托 getResolvedLocale）。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as AppLocale)) {
    // 自定义 middleware 不 set next-intl locale header，requestLocale 通常为 undefined；
    // 无 header 或非法时统一走「用户 cookie → 全局默认语言 → 静态兜底」加载顺序（见 getResolvedLocale）
    locale = await getResolvedLocale();
  }

  // 时区加载顺序统一委托 getResolvedTimeZone：cookie `money_timezone` → 全局设置 default_timezone → 静态 DEFAULT_TIME_ZONE
  const timeZone = await getResolvedTimeZone();

  return {
    locale: locale as AppLocale,
    timeZone,
    now: new Date(),
    messages: getMergedDict(locale as AppLocale),
  };
});
