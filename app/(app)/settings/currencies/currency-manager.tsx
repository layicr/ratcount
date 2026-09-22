"use client";

import { useState } from "react";
import {
  toggleCurrency, createCurrency, updateCurrency, deleteCurrency, } from "@/app/actions/common";
import { useTranslations, useFormatter } from "next-intl";
import { ConfirmButton, DeleteButton } from "../../components/confirm";
import { DEFAULT_CURRENCY } from "@/lib/constants";

type Currency = { code: string; name: string; symbol: string; rate: number; isActive: boolean; isBase: boolean; remark: string | null; createdAt: string; updatedAt: string };

const empty = { code: "", symbol: "¥", name: "", rate: "1", isActive: true, remark: "" };

/** 币种管理界面：新增 / 编辑 / 删除 / 启用停用（汇率只读显示，在新增/编辑币种时设置） */
export function CurrencyManager({ currencies }: { currencies: Currency[] }) {
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
  function startEdit(c: Currency) {
    setForm({ code: c.code, symbol: c.symbol, name: c.name, rate: String(c.rate), isActive: c.isActive, remark: c.remark ?? "" });
    setFormErr(null);
    setEditingCode(c.code);
    setCreating(false);
  }
  function closeForm() {
    setCreating(false);
    setEditingCode(null);
    setFormErr(null);
  }

  async function doSubmit() {
    // 前端校验（替代原生 required，支持 i18n）
    if (!form.code.trim()) { setFormErr(t("currency.codeRequired")); return; }
    if (!form.symbol.trim()) { setFormErr(t("currency.symbolRequired")); return; }
    if (!form.name.trim()) { setFormErr(t("common.nameRequired")); return; }
    if (!form.rate.trim() || parseFloat(form.rate) <= 0) { setFormErr(t("currency.rateRequired")); return; }
    setFormErr(null);

    const r = creating
      ? await createCurrency(form)
      : await updateCurrency(editingCode!, form);
    if (r.ok) {
      closeForm();
      flash(true, t("settings.saved"));
    } else {
      setFormErr(r.error ?? t("settings.saving"));
    }
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!form.code.trim()) { setFormErr(t("currency.codeRequired")); return false; }
    if (!form.symbol.trim()) { setFormErr(t("currency.symbolRequired")); return false; }
    if (!form.name.trim()) { setFormErr(t("common.nameRequired")); return false; }
    if (!form.rate.trim() || parseFloat(form.rate) <= 0) { setFormErr(t("currency.rateRequired")); return false; }
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
              <label className="mb-1 block text-xs text-slate-500">{t("currency.code")} <span className="text-red-500">*</span></label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                maxLength={8}
                disabled={!!editingCode}
                placeholder={DEFAULT_CURRENCY}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("currency.symbol")} <span className="text-red-500">*</span></label>
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                maxLength={4}
                placeholder="¥"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.name")} <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={60}
                placeholder={t("currency.namePlaceholder")}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.rate")} <span className="text-red-500">*</span></label>
              <input
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                inputMode="decimal"
                placeholder="1.00"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">{t("common.remark")}</label>
              <input
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
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
              title={t("currency.saveEditTitle")}
              desc={t("common.saveEditDesc", { id: form.code })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={closeForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {/* 新增按钮（已移至表格标题行） */}

      {/* 币种列表（新增/编辑时隐藏） */}
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2">{t("common.currency")}</th>
                <th>{t("common.name")}</th>
                <th className="text-right">{t("common.rate")}</th>
                <th className="text-right">{t("common.status")}</th>
                <th className="text-right">{t("common.createdAt")}</th>
                <th className="text-right">{t("common.updatedAt")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => (
                <tr key={c.code} className="border-b border-slate-50">
                  <td className="py-2 font-medium">
                    {c.symbol} {c.code}
                    {c.isBase && <span className="ml-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-700">{t("currency.base")}</span>}
                  </td>
                  <td className="text-slate-500">{c.name}</td>
                  <td className="text-right">
                    <span className="font-mono text-sm text-slate-700">{c.rate}</span>
                  </td>
                  <td className="text-right">
                    <ConfirmButton
                      action={async () => { await toggleCurrency(c.code, !c.isActive); }}
                      title={c.isActive ? t("settings.deactTitle") : t("settings.actTitle")}
                      desc={c.isActive ? t("settings.deactDesc", { code: c.code }) : t("settings.actDesc", { code: c.code })}
                      okText={c.isActive ? t("settings.deactivate") : t("common.active")}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs ${c.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                        {c.isActive ? t("settings.active") : t("settings.inactive")}
                      </span>
                    </ConfirmButton>
                  </td>
                  <td className="text-xs text-slate-400 whitespace-nowrap  text-right">
                    {f.dateTime(new Date(c.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-xs text-slate-400 whitespace-nowrap text-right">
                    {f.dateTime(new Date(c.updatedAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(c)} className="text-xs text-slate-500 hover:text-teal-600">{t("common.edit")}</button>
                      {!c.isBase && (
                        <DeleteButton
                          action={async () => { await deleteCurrency(c.code); }}
                          title={t("currency.delTitle")}
                          desc={t("currency.delDesc", { code: c.code })}
                          okText={t("common.delete")}
                          label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                        />
                      )}
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
