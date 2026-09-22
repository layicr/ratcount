"use client";

import { useState } from "react";
import {
  toggleLanguage,
  createLanguage,
  updateLanguage,
  deleteLanguage,
} from "@/app/actions/settings/languages";
import { useTranslations, useFormatter } from "next-intl";
import { ConfirmButton, DeleteButton } from "../../components/confirm";

type Language = { code: string; name: string; nativeName: string; isDefault: boolean; isEnabled: boolean; sort: number; createdBy: string | null; createdAt: string; updatedAt: string };

const empty = { code: "", name: "", nativeName: "", isDefault: false, isEnabled: true, sort: 0 };

/** 语言管理界面：新增 / 编辑 / 删除 / 启用停用 */
export function LanguageManager({ languages }: { languages: Language[] }) {
  const t = useTranslations();
  const f = useFormatter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [formErr, setFormErr] = useState<string | null>(null);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2500);
  }

  function startCreate() {
    setForm(empty);
    setFormErr(null);
    setCreating(true);
    setEditingCode(null);
  }
  function startEdit(lang: Language) {
    setForm({ code: lang.code, name: lang.name, nativeName: lang.nativeName, isDefault: lang.isDefault, isEnabled: lang.isEnabled, sort: lang.sort });
    setFormErr(null);
    setEditingCode(lang.code);
    setCreating(false);
  }
  function closeForm() {
    setCreating(false);
    setEditingCode(null);
    setFormErr(null);
  }

  async function doSubmit() {
    // 前端校验
    if (!form.code.trim()) { setFormErr(t("language.codeRequired")); return; }
    if (!form.name.trim()) { setFormErr(t("language.nameRequired")); return; }
    if (!form.nativeName.trim()) { setFormErr(t("language.nativeNameRequired")); return; }
    setFormErr(null);

    const r = creating
      ? await createLanguage(form)
      : await updateLanguage(editingCode!, form);
    if (r.ok) {
      closeForm();
      flash(true, t("settings.saved"));
    } else {
      setFormErr(r.error ?? t("settings.saving"));
    }
  }

  /** 保存前校验 */
  function validateBeforeSave(): boolean {
    if (!form.code.trim()) { setFormErr(t("language.codeRequired")); return false; }
    if (!form.name.trim()) { setFormErr(t("language.nameRequired")); return false; }
    if (!form.nativeName.trim()) { setFormErr(t("language.nativeNameRequired")); return false; }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* 新增/编辑表单 */}
      {(creating || editingCode) && (
        <form className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-800">
            {creating ? t("common.add") : t("common.edit")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("language.code")} <span className="text-red-500">*</span></label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, "") })}
                maxLength={20}
                disabled={!!editingCode}
                placeholder="en"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.displayName")} <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={60}

                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("language.nativeName")} <span className="text-red-500">*</span></label>
              <input
                value={form.nativeName}
                onChange={(e) => setForm({ ...form, nativeName: e.target.value })}
                maxLength={60}

                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.sort")}</label>
              <input
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: parseInt(e.target.value) || 0 })}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div className="flex items-end pb-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="accent-teal-600"
                />
                {t("language.default")}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                  className="accent-teal-600"
                />
                {t("settings.active")}
              </label>
            </div>
          </div>
          {formErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formErr}</p>}
          <div className="flex gap-2">
            <ConfirmButton
              action={doSubmit}
              beforeOpen={validateBeforeSave}
              title={creating ? t("language.saveTitle") : t("language.saveEditTitle")}
              desc={creating ? t("common.createDesc") : t("common.saveEditDesc", { id: form.code })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={closeForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {/* 语言列表（新增/编辑时隐藏） */}
      {!creating && !editingCode && (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3">
          {!creating && !editingCode && (
            <button onClick={startCreate} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
              {t("common.add")}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2">{t("language.code")}</th>
                <th>{t("common.createdBy")}</th>
                <th>{t("common.displayName")}</th>
                <th>{t("language.nativeName")}</th>
                <th className="text-right">{t("common.sort")}</th>
                <th className="text-right">{t("language.isDefault")}</th>
                <th className="text-right">{t("common.status")}</th>
                <th className="text-right">{t("common.createdAt")}</th>
                <th className="text-right">{t("common.updatedAt")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {languages.map((lang) => (
                <tr key={lang.code} className="border-b border-slate-50">
                  <td className="py-2 font-medium font-mono">{lang.code}</td>
                  <td className="text-slate-500">
                    {lang.createdBy ? (
                      <span className="font-mono text-xs text-slate-400">{lang.createdBy.slice(0, 8)}</span>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                  <td className="text-slate-500">{lang.name}</td>
                  <td className="text-slate-500">{lang.nativeName}</td>
                  <td className="text-right">
                    <span className="font-mono text-sm text-slate-700">{lang.sort}</span>
                  </td>
                  <td className="text-right">
                    {lang.isDefault
                      ? <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">✓</span>
                      : <span className="text-slate-300">–</span>}
                  </td>
                  <td className="text-right">
                    <ConfirmButton
                      action={async () => { await toggleLanguage(lang.code, !lang.isEnabled); }}
                      title={lang.isEnabled ? t("settings.deactTitle") : t("settings.actTitle")}
                      desc={lang.isEnabled ? t("settings.deactDesc", { code: lang.code }) : t("settings.actDesc", { code: lang.code })}
                      okText={lang.isEnabled ? t("settings.deactivate") : t("common.active")}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs ${lang.isEnabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                        {lang.isEnabled ? t("settings.active") : t("settings.inactive")}
                      </span>
                    </ConfirmButton>
                  </td>
                  <td className="text-right text-xs text-slate-400 whitespace-nowrap">
                    {f.dateTime(new Date(lang.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-right text-xs text-slate-400 whitespace-nowrap">
                    {f.dateTime(new Date(lang.updatedAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(lang)} className="text-xs text-slate-500 hover:text-teal-600">{t("common.edit")}</button>
                      <DeleteButton
                        action={async () => { await deleteLanguage(lang.code); }}
                        title={t("language.delTitle")}
                        desc={t("language.delDesc", { code: lang.code })}
                        okText={t("common.delete")}
                        label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
