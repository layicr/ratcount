"use client";

import { createContext, useContext } from "react";
import zh from "@/messages/zh.json";
import en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n";

/** 字典类型 / Dictionary type */
type Dict = typeof zh;
/** 取文案：t("nav.dashboard") 或 t("welcome", { name }) */
export type T = (key: string, vars?: Record<string, string | number>) => string;

const Ctx = createContext<{ t: T; locale: Locale }>({
  t: (k) => k,
  locale: "zh",
});

/**
 * 客户端 i18n Provider
 *  - locale 由根布局（服务端）从 cookie 读出后注入
 *  - 语言切换 = 写 cookie + reload，全站生效
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const dict: Dict = locale === "en" ? (en as unknown as Dict) : zh;
  const t: T = (key, vars) => {
    const v = key
      .split(".")
      .reduce<unknown>(
        (o, p) =>
          o && typeof o === "object"
            ? (o as Record<string, unknown>)[p]
            : undefined,
        dict,
      );
    const str = typeof v === "string" ? v : key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  };
  return <Ctx.Provider value={{ t, locale }}>{children}</Ctx.Provider>;
}

/** 客户端取文案 / Client-side t() */
export function useT(): T {
  return useContext(Ctx).t;
}

/** 当前语言 / Current locale */
export function useLocale(): Locale {
  return useContext(Ctx).locale;
}
