"use client";

import { useState } from "react";
import { createAccount, updateAccount, deleteAccount } from "@/app/actions/accounts";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/currency-context";
import { ConfirmButton, DeleteButton } from "../components/confirm";
import { IconPicker } from "../components/icon-picker";
import { AccountTypeBadge } from "../components/badges";
import { AccountTypeSelect } from "../components/account-type-select";
import { ACCT, DEFAULT_CURRENCY } from "@/lib/constants"
import { ACCOUNT_TYPES } from "@/lib/constants";

/** 账户类型选项（label 用 i18n key） */
const TYPES = ACCOUNT_TYPES;

type Acct = {
  id: string; name: string; type: string; icon: string; currencyCode: string;
  openingYuan: string; isAsset: boolean; remark: string | null; balanceCents: number;
};

type CurrencyOption = { code: string; name: string };

/** 账户表单值：type 保持 string（账户类型存 DB 文本，编辑/下拉回传可能是任意字符串） */
type AcctForm = {
  name: string; type: string; icon: string; currencyCode: string;
  openingYuan: string; isAsset: boolean; remark: string;
};

const empty: AcctForm = { name: "", type: ACCT.debit_card, icon: "💳", currencyCode: DEFAULT_CURRENCY, openingYuan: "0.00", isAsset: true, remark: "" };

/** 账户管理：卡片列表 + 内联表单 + 删除确认（i18n） */
export function AccountsManager({
  accts, currencies,
}: { accts: Acct[]; currencies: CurrencyOption[] }) {
  const tt = useTranslations();
  const money = useMoney();
  const [editing, setEditing] = useState<Acct | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);

  function startCreate() {
    setForm(empty);
    setErr(null);
    setCreating(true);
  }
  function startEdit(a: Acct) {
    setForm({ name: a.name, type: a.type, icon: a.icon, currencyCode: a.currencyCode, openingYuan: a.openingYuan, isAsset: a.isAsset, remark: a.remark ?? "" });
    setEditing(a);
    setErr(null);
  }
  function close() {
    setCreating(false);
    setEditing(null);
    setErr(null);
  }

  async function doSubmit() {
    setErr(null);
    const payload = { ...form, isAsset: form.isAsset };
    const r = editing
      ? await updateAccount(editing.id, payload)
      : await createAccount(payload);
    if (r.ok) close();
    else setErr(r.error);
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!form.name.trim()) {
      setErr("common.nameRequired");
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* 表单 */}
      {(creating || editing) && (
        <form className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-800">{editing ? tt("common.edit") : tt("common.add")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{tt("common.name")} <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{tt("common.icon")}</label>
              <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{tt("common.type")} <span className="text-red-500">*</span></label>
              <AccountTypeSelect value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{tt("common.currency")}</label>
              <select value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} / {c.code}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{tt("accounts.opening")}</label>
              <input value={form.openingYuan} onChange={(e) => setForm({ ...form, openingYuan: e.target.value })} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.isAsset} onChange={(e) => setForm({ ...form, isAsset: e.target.checked })} className="accent-teal-600" />
                {tt("accounts.isAsset")}
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">{tt("common.remark")}</label>
              <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </div>
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{tt(err)}</p>}
          <div className="flex gap-2">
            <ConfirmButton
              action={doSubmit}
              beforeOpen={validateBeforeSave}
              title={editing ? tt("accounts.saveEditTitle") : tt("accounts.saveTitle")}
              desc={editing ? tt("common.saveEditDesc", { id: form.name }) : tt("common.createDesc")}
              okText={tt("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{tt("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{tt("common.cancel")}</button>
          </div>
        </form>
      )}

      {/* 新增按钮 */}
      {!creating && !editing && (
        <button onClick={startCreate} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{tt("common.add")}</button>
      )}

      {/* 列表：按账户类型分组 */}
      <div className="space-y-6">
        {TYPES.map((type) => {
          const typeAccts = accts.filter((a) => a.type === type.v);
          if (typeAccts.length === 0) return null;
          return (
            <div key={type.v}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="h-4 w-1 rounded-full bg-teal-500"></span>
                {tt(type.key)}
                <span className="text-xs font-normal text-slate-400">({typeAccts.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {typeAccts.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{a.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{a.name}</div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <AccountTypeBadge type={a.type} />
                            <span className="text-[10px] text-slate-400">{currencies.find((c) => c.code === a.currencyCode)?.name || a.currencyCode} / {a.currencyCode}</span>
                            {a.isAsset ? (
                              <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-600">{tt("accounts.isAsset")}</span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-600">{tt("accounts.notAsset")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`mt-3 text-lg font-bold ${a.balanceCents < 0 ? "text-red-600" : "text-slate-900"}`}>
                      {money(a.balanceCents)}
                    </div>
                    {a.remark && <div className="mt-1 text-[11px] text-slate-400">{a.remark}</div>}
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <a href={`/transactions?accountId=${a.id}`} className="text-xs text-teal-600 hover:underline">{tt("common.viewTx")}</a>
                      <button onClick={() => startEdit(a)} className="text-xs text-slate-500 hover:text-teal-600">{tt("common.edit")}</button>
                      <DeleteButton
                        action={async () => { await deleteAccount(a.id); }}
                        title={tt("accounts.delTitle")}
                        desc={tt("common.delDesc", { name: a.name })}
                        okText={tt("common.delete")}
                        label={<span className="text-xs text-red-500 hover:underline">{tt("common.delete")}</span>}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
