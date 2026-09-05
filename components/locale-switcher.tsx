"use client";

import { useLocale } from "./i18n-provider";

/** 语言切换器：写 cookie ratcount_locale 并整页刷新，服务端据此渲染全站 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();

  function set(l: string) {
    document.cookie = `ratcount_locale=${l}; path=/; max-age=31536000`;
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={() => set(locale === "zh" ? "en" : "zh")}
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
      className={
        className ??
        "rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
      }
    >
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}
