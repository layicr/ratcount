"use client";

import { useLocale, useTranslations } from "next-intl";
import { locales as allLocales, localeLabels } from "@/lib/localize";
import { LOCALE_COOKIE_NAME } from "@/lib/constants";

type LocOpt = { code: string; label: string };

/**
 * 语言切换器：写语言 cookie 并整页刷新，服务端据此渲染全站。
 * 语言列表默认来自静态回退（lib/localize），可由服务端传入 DB 启用的 languages，
 * 从而后台停用/新增语言会即时反映到切换器（新增语言无需改此处）。
 */
export function LocaleSwitcher({
  className,
  locales,
}: {
  className?: string;
  locales?: LocOpt[];
}) {
  const locale = useLocale();
  const t = useTranslations();
  const opts: LocOpt[] =
    locales && locales.length
      ? locales
      : allLocales.map((c) => ({ code: c, label: localeLabels[c] }));

  function set(l: string) {
    document.cookie = `${LOCALE_COOKIE_NAME}=${l}; path=/; max-age=31536000`;
    window.location.reload();
  }

  return (
    <select
      value={locale}
      onChange={(e) => set(e.target.value)}
      aria-label={t("profile.language")}
      title={t("profile.language")}
      className={
        className ??
        "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-teal-500"
      }
    >
      {opts.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
