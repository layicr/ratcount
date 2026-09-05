import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { getAllSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

/** 全局设置（仅管理员）：系统设置 + 币种管理入口（点进去才是币种管理界面） */
export default async function SettingsPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");

  const all = await getAllSettings();
  const s = Object.fromEntries(all.map((x) => [x.key, x.value]));
  const isAdmin = user.role === "admin";

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.settings.title}</h1>
      <SettingsForm
        initial={{
          app_name_zh: s.app_name_zh ?? "ratcount",
          app_name_en: s.app_name_en ?? "ratcount",
          app_slogan_zh: s.app_slogan_zh ?? "",
          app_slogan_en: s.app_slogan_en ?? "",
          default_locale: s.default_locale ?? "zh",
          allow_registration: s.allow_registration === "true",
          enable_login_captcha: s.enable_login_captcha === "true",
          audit_log_retention_days: s.audit_log_retention_days ?? "90",
          copyright: s.copyright ?? "© 2026 ratcount",
          allowed_page_sizes: s.allowed_page_sizes ?? "10,20,50,100",
          default_page_size: s.default_page_size ?? "20",
        }}
      />

      {/* 币种管理入口：点击进入独立的币种管理界面 /settings/currencies */}
      <Link
        href="/settings/currencies"
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
        href="/settings/users"
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

      {/* 操作日志入口：点击进入独立的操作日志界面 /settings/logs */}
      <Link
        href="/settings/logs"
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
