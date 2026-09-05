"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/app/actions/settings";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../components/confirm";

/** 全局设置表单：系统设置（币种管理已拆到独立页面 /settings/currencies） */
export function SettingsForm({
  initial,
}: {
  initial: {
    app_name_zh: string; app_name_en: string;
    app_slogan_zh: string; app_slogan_en: string;
    default_locale: string; allow_registration: boolean;
    enable_login_captcha: boolean; audit_log_retention_days: string;
    copyright: string;
    allowed_page_sizes: string;
    default_page_size: string;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState(initial);
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
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-teal-600" : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-800">{t("settings.sysTitle")}</h2>
      {/* 应用名称中文 / App name in Chinese */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appNameZh")}</label>
        <div className="flex gap-2">
          <input value={form.app_name_zh} onChange={(e) => setForm({ ...form, app_name_zh: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save("app_name_zh", form.app_name_zh)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveAppNameDesc", { value: form.app_name_zh })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 应用名称英文 / App name in English */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appNameEn")}</label>
        <div className="flex gap-2">
          <input value={form.app_name_en} onChange={(e) => setForm({ ...form, app_name_en: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save("app_name_en", form.app_name_en)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveAppNameDesc", { value: form.app_name_en })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 应用宣言中文 / App slogan in Chinese */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appSloganZh")}</label>
        <div className="flex gap-2">
          <textarea value={form.app_slogan_zh} onChange={(e) => setForm({ ...form, app_slogan_zh: e.target.value })} rows={2} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save("app_slogan_zh", form.app_slogan_zh)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveSloganDesc", { value: form.app_slogan_zh })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      {/* 应用宣言英文 / App slogan in English */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.appSloganEn")}</label>
        <div className="flex gap-2">
          <textarea value={form.app_slogan_en} onChange={(e) => setForm({ ...form, app_slogan_en: e.target.value })} rows={2} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save("app_slogan_en", form.app_slogan_en)}
            title={t("settings.saveTitle")}
            desc={t("settings.saveSloganDesc", { value: form.app_slogan_en })}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-3 py-2 text-xs text-white">{t("common.save")}</span>
          </ConfirmButton>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.defaultLocale")}</label>
        <select value={form.default_locale} onChange={(e) => { setForm({ ...form, default_locale: e.target.value }); save("default_locale", e.target.value); }} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
          <option value="zh">{t("i18n.zh")}</option><option value="en">{t("i18n.en")}</option>
        </select>
      </div>
      <Switch on={form.allow_registration} label={t("settings.allowRegistration")} onClick={() => { const v = !form.allow_registration; setForm({ ...form, allow_registration: v }); save("allow_registration", String(v)); }} />
      <Switch on={form.enable_login_captcha} label={t("settings.enableCaptcha")} onClick={() => { const v = !form.enable_login_captcha; setForm({ ...form, enable_login_captcha: v }); save("enable_login_captcha", String(v)); }} />
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("settings.retentionDays")}</label>
        <div className="flex gap-2">
          <input value={form.audit_log_retention_days} onChange={(e) => setForm({ ...form, audit_log_retention_days: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="1-3650" className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          <ConfirmButton
            action={() => save("audit_log_retention_days", form.audit_log_retention_days)}
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
            action={() => save("copyright", form.copyright)}
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
            action={() => save("allowed_page_sizes", form.allowed_page_sizes)}
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
            action={() => save("default_page_size", form.default_page_size)}
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
