"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLedger, updateLedger, deleteLedger } from "@/app/actions/ledgers";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../components/confirm";
import { IconPicker } from "../components/icon-picker";

type Ledger = {
  id: string; name: string; icon: string; baseCurrencyCode: string;
  remark: string | null; createdAt: string; role: string; memberCount: number;
};

type CurrencyOption = { code: string; name: string };

const empty = { name: "", icon: "📒", baseCurrencyCode: "CNY", remark: "" };

/** 账本管理：列表 + 新增/编辑表单 + 删除确认（i18n） */
export function LedgersManager({
  ledgers, currentId, currencies,
}: {
  ledgers: Ledger[];
  currentId: string;
  currencies: CurrencyOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Ledger | null>(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);

  function startCreate() {
    setForm(empty);
    setErr(null);
    setCreating(true);
  }
  function startEdit(l: Ledger) {
    setForm({ name: l.name, icon: l.icon, baseCurrencyCode: l.baseCurrencyCode, remark: l.remark ?? "" });
    setEditing(l);
    setErr(null);
  }
  function close() {
    setCreating(false);
    setEditing(null);
    setErr(null);
  }

  async function doSubmit() {
    setErr(null);
    const r = editing
      ? await updateLedger(editing.id, form)
      : await createLedger(form);
    if (r.ok) close();
    else setErr(r.error);
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!form.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }

  /** 切换当前账本 / Switch current ledger */
  function switchLedger(id: string) {
    document.cookie = `ratcount_ledger=${id}; path=/; max-age=31536000`;
    router.push("/dashboard");
    router.refresh();
  }

  const roleBadge = (role: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      owner: { bg: "bg-teal-100", text: "text-teal-700", label: t("ledgers.roleOwner") },
      editor: { bg: "bg-blue-100", text: "text-blue-700", label: t("ledgers.roleEditor") },
      viewer: { bg: "bg-slate-100", text: "text-slate-500", label: t("ledgers.roleViewer") },
    };
    const s = map[role] ?? map.viewer;
    return <span className={`rounded-full px-2 py-0.5 text-[10px] ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* 新增/编辑表单 */}
      {(creating || editing) && (
        <form className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-800">
            {editing ? t("ledgers.edit") : t("ledgers.add")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.icon")}</label>
              <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.name")} *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={30}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("ledgers.baseCurrency")}</label>
              <select
                value={form.baseCurrencyCode}
                onChange={(e) => setForm({ ...form, baseCurrencyCode: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} / {c.code}</option>)}
              </select>
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
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
          <div className="flex gap-2">
            <ConfirmButton
              action={doSubmit}
              beforeOpen={validateBeforeSave}
              title={editing ? t("ledgers.saveEditTitle") : t("ledgers.saveTitle")}
              desc={editing ? t("ledgers.saveEditDesc", { name: form.name }) : t("ledgers.saveDesc", { name: form.name })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {/* 新增按钮 */}
      {!creating && !editing && (
        <button onClick={startCreate} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
          {t("ledgers.add")}
        </button>
      )}

      {/* 账本列表 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ledgers.map((l) => (
          <div
            key={l.id}
            className={`rounded-2xl border bg-white p-4 transition ${
              l.id === currentId ? "border-teal-400 ring-1 ring-teal-200" : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{l.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{l.name}</div>
                  <div className="mt-0.5 flex items-center gap-1">
                    {roleBadge(l.role)}
                    <span className="text-[10px] text-slate-400">{currencies.find((c) => c.code === l.baseCurrencyCode)?.name || l.baseCurrencyCode} / {l.baseCurrencyCode}</span>
                    {l.id === currentId && (
                      <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-600">{t("ledgers.current")}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {l.remark && <div className="mt-2 text-[11px] text-slate-400">{l.remark}</div>}
            <div className="mt-1 text-[10px] text-slate-400">
              {t("ledgers.members")}: {l.memberCount}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {l.id !== currentId && (
                <button
                  onClick={() => switchLedger(l.id)}
                  className="text-xs text-teal-600 hover:underline"
                >
                  {t("ledgers.switch")}
                </button>
              )}
              {l.role === "owner" && (
                <>
                  <button onClick={() => startEdit(l)} className="text-xs text-slate-500 hover:text-teal-600">
                    {t("common.edit")}
                  </button>
                  <ConfirmButton
                    danger
                    action={async () => { await deleteLedger(l.id); }}
                    title={t("ledgers.delTitle")}
                    desc={t("ledgers.delDesc", { name: l.name })}
                    okText={t("common.delete")}
                  >
                    <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
                  </ConfirmButton>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
