"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/app/actions/settings";
import { useTranslations, useLocale } from "next-intl";
import { ConfirmButton } from "../components/confirm";
import { COMMON_TIME_ZONES, tzLabel } from "@/i18n/timezones";
import { THEME_ITEMS, applyThemeToDocument } from "@/i18n/themes";
import { locales, localeLabels } from "@/lib/localize";
import { SETTING_KEY } from "@/lib/constants";

type LanguageRow = { code: string; nativeName: string };

/** 将 settings 存储值解析为多语言对象；旧单字符串按启用语言铺平，避免存量值丢失 */
function parseLocalizedName(value: string, languages: LanguageRow[]): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* 旧单字符串：按启用语言铺平 */
  }
  return Object.fromEntries(languages.map((l) => [l.code, value]));
}

/** 全局设置表单：系统设置（币种管理已拆到独立页面 /settings/currencies） */
export function SettingsForm({
  initial,
  languages,
}: {
  initial: {
    app_name: string;
    app_slogan: string;
    default_locale: string; allow_registration: boolean;
    enable_login_captcha: boolean; audit_log_retention_days: string;
    copyright: string;
    allowed_page_sizes: string;
    default_page_size: string;
    default_timezone: string;
    default_theme: string;
  };
  languages: LanguageRow[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    ...initial,
    app_name: parseLocalizedName(initial.app_name, languages),
    app_slogan: parseLocalizedName(initial.app_slogan, languages),
  }));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(key: string, value: string) {
    // 操作日志保留天数：数字范围校验（1-3650 天）
    if (key === "audit_log_retention_days") {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 3650) {
        setMsg({ ok: false, text: t("settings.retentionInvalid") });
        setTimeout(() => setMsg(null), 2500);
        return;
      }
    }
    // 允许的每页条数：逗号分隔的正整数校验
    if (key === "allowed_page_sizes") {
      const sizes = value.split(",").map((s) => parseInt(s.trim(), 10));
      if (sizes.length === 0 || sizes.length > 10 || sizes.some((n) => isNaN(n) || n < 1 || n > 1000)) {
        setMsg({ ok: false, text: t("settings.allowedPageSizesInvalid") });
        setTimeout(() => setMsg(null), 2500);
        return;
      }
    }
    // 默认每页条数：正整数校验
    if (key === "default_page_size") {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 1000) {
        setMsg({ ok: false, text: t("settings.defaultPageSizeInvalid") });
        setTimeout(() => setMsg(null), 2500);
        return;
      }
    }
    const r = await updateSetting(key, value);
    setMsg(r.ok ? { ok: true, text: t("settings.saved") } : { ok: false, text: r.error ?? t("settings.saving") });
    // 保存成功后即时刷新页面数据（app_name / 语言 / 开关等立即生效）
    if (r.ok) router.refresh();
    setTimeout(() => setMsg(null), 2500);
  }

  const Switch = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-600">{label}</span>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        role="switch"
        aria-checked={on}
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-teal-600" : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-800">{t("settings.sysTitle")}</h2>
      {/* 应用名称（多语言，逐语言输入框，对齐菜单分组管理） */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appName")}</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {locales.map((loc) => (
            <div key={loc}>
              <label className="mb-1 block text-[10px] text-slate-400">{localeLabels[loc]}</label>
              <input
                value={form.app_name[loc] ?? ""}
                onChange={(e) => setForm({ ...form, app_name: { ...form.app_name, [loc]: e.target.value } })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <ConfirmButton
            action={() => save(SETTING_KEY.appName, JSON.stringify(form.app_name))}
            title={t("settings.saveTitle")}
            desc={t("settings.saveAppNameDesc", { value: form.app_name[locale] ?? "" })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 应用宣言（多语言，逐语言输入框，对齐菜单分组管理） */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appSlogan")}</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {locales.map((loc) => (
            <div key={loc}>
              <label className="mb-1 block text-[10px] text-slate-400">{localeLabels[loc]}</label>
              <textarea
                value={form.app_slogan[loc] ?? ""}
                onChange={(e) => setForm({ ...form, app_slogan: { ...form.app_slogan, [loc]: e.target.value } })}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <ConfirmButton
            action={() => save(SETTING_KEY.appSlogan, JSON.stringify(form.app_slogan))}
            title={t("settings.saveTitle")}
            desc={t("settings.saveSloganDesc", { value: form.app_slogan[locale] ?? "" })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.defaultLocale")}</label>
        <select value={form.default_locale} onChange={(e) => { setForm({ ...form, default_locale: e.target.value }); save(SETTING_KEY.defaultLocale, e.target.value); }} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.defaultTimezone")}</label>
        <select value={form.default_timezone} onChange={(e) => { setForm({ ...form, default_timezone: e.target.value }); save(SETTING_KEY.defaultTimezone, e.target.value); }} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
          {COMMON_TIME_ZONES.map((code) => (
            <option key={code} value={code}>{tzLabel(code, locale)}</option>
          ))}
        </select>
      </div>
      {/* 默认风格（与个人中心「风格设置」同源，写入 settings.default_theme） */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.defaultTheme")}</label>
        <div className="grid grid-cols-4 gap-2">
          {THEME_ITEMS.map(({ code, color }) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setForm({ ...form, default_theme: code });
                applyThemeToDocument(code); // 即时预览 / Live preview
                save(SETTING_KEY.defaultTheme, code);
              }}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition ${
                form.default_theme === code
                  ? "bg-teal-600 text-white ring-2 ring-teal-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span
                className="h-4 w-4 rounded-full border border-white/50"
                style={{ backgroundColor: color }}
              />
              {t(`theme.${code}`)}
            </button>
          ))}
        </div>
      </div>

      <Switch on={form.allow_registration} label={t("settings.allowRegistration")} onClick={() => { const v = !form.allow_registration; setForm({ ...form, allow_registration: v }); save(SETTING_KEY.allowRegistration, String(v)); }} />
      <Switch on={form.enable_login_captcha} label={t("settings.enableCaptcha")} onClick={() => { const v = !form.enable_login_captcha; setForm({ ...form, enable_login_captcha: v }); save(SETTING_KEY.enableLoginCaptcha, String(v)); }} />
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.retentionDays")}</label>
        <div className="flex gap-2">
          <input value={form.audit_log_retention_days} onChange={(e) => setForm({ ...form, audit_log_retention_days: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="1-3650" className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save(SETTING_KEY.auditLogRetentionDays, form.audit_log_retention_days)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveRetentionDesc", { value: form.audit_log_retention_days })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.copyright")}</label>
        <div className="flex gap-2">
          <input value={form.copyright} onChange={(e) => setForm({ ...form, copyright: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save(SETTING_KEY.copyright, form.copyright)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveCopyrightDesc", { value: form.copyright })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 允许的每页条数 / Allowed page sizes */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.allowedPageSizes")}</label>
        <div className="flex gap-2">
          <input value={form.allowed_page_sizes} onChange={(e) => setForm({ ...form, allowed_page_sizes: e.target.value })} placeholder="10,20,50,100" className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save(SETTING_KEY.allowedPageSizes, form.allowed_page_sizes)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveAllowedPageSizesDesc", { value: form.allowed_page_sizes })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 默认每页条数 / Default page size */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.defaultPageSize")}</label>
        <div className="flex gap-2">
          <input value={form.default_page_size} onChange={(e) => setForm({ ...form, default_page_size: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="20" className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save(SETTING_KEY.defaultPageSize, form.default_page_size)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveDefaultPageSizeDesc", { value: form.default_page_size })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
