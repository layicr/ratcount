import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, DEFAULT_LANGUAGE, SETTINGS_CURRENCIES_PATH, SETTINGS_LANGUAGES_PATH, SETTINGS_MENUS_PATH, SETTINGS_MENU_GROUPS_PATH, SETTINGS_LOGS_PATH, SETTINGS_USERS_PATH } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { getAllSettings } from "@/lib/settings";
import { listLanguages } from "@/lib/queries";
import { SettingsForm } from "./settings-form";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";
import { DEFAULT_TIME_ZONE } from "@/i18n/timezones";
import { DEFAULT_THEME } from "@/i18n/themes";

/** 全局设置（仅管理员）：系统设置 + 币种/语言/用户/日志/菜单/菜单分组管理入口 */
export default async function SettingsPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  const isAdmin = user.role === ROLE.admin;

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
      </div>
    );
  }

  const [all, langs] = await Promise.all([getAllSettings(), listLanguages()]);
  const s = Object.fromEntries(all.map((x) => [x.key, x.value]));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.settings.title}</h1>
      <SettingsForm
        initial={{
          app_name: s.app_name ?? "",
          app_slogan: s.app_slogan ?? "",
          default_locale: s.default_locale ?? DEFAULT_LANGUAGE,
          default_timezone: s.default_timezone ?? DEFAULT_TIME_ZONE,
          default_theme: s.default_theme ?? DEFAULT_THEME,
          allow_registration: s.allow_registration === "true",
          enable_login_captcha: s.enable_login_captcha === "true",
          audit_log_retention_days: s.audit_log_retention_days ?? "90",
          copyright: s.copyright ?? "",
          allowed_page_sizes: s.allowed_page_sizes ?? "10,20,50,100",
          default_page_size: s.default_page_size ?? "20",
        }}
        languages={langs.filter((l) => l.isEnabled)}
      />

      {/* 语言配置入口：点击进入独立的语言管理界面 /settings/languages */}
      <Link
        href={SETTINGS_LANGUAGES_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-xl">🌐</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.settings.languageMgmt}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.settings.languageManageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>

      {/* 币种管理入口：点击进入独立的币种管理界面 /settings/currencies */}
      <Link
        href={SETTINGS_CURRENCIES_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-xl">💱</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.settings.currencyMgmt}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.settings.currencyManageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>

      {/* 用户管理入口：点击进入独立的用户管理界面 /settings/users */}
      <Link
        href={SETTINGS_USERS_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-xl">👥</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.userMgmt.title}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.userMgmt.manageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>

      {/* 菜单分组管理入口：点击进入独立的全局菜单分组管理界面 /settings/menu-groups */}
      <Link
        href={SETTINGS_MENU_GROUPS_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-xl">🗂️</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.menuMgmt.groupTitle}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.menuMgmt.groupManageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>

      {/* 菜单管理入口：点击进入独立的全局菜单管理界面 /settings/menus */}
      <Link
        href={SETTINGS_MENUS_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-xl">🧭</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.menuMgmt.title}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.menuMgmt.manageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>

      {/* 操作日志入口：点击进入独立的操作日志界面 /settings/logs */}
      <Link
        href={SETTINGS_LOGS_PATH}
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-xl">📋</span>
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.logs.title}</div>
            <div className="mt-0.5 text-xs text-slate-500">{d.logs.manageDesc}</div>
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>
    </div>
  );
}
