"use client";

import { useState } from "react";
import {
  createRecurringPlan, updateRecurringPlan, deleteRecurringPlan, toggleRecurringPlan, runRecurringPlan, } from "@/app/actions/recurring";
import { useTranslations, useLocale } from "next-intl";
import { useBaseCurrency } from "@/components/currency-context";
import { formatCurrency } from "@/lib/money";
import { ConfirmButton, DeleteButton } from "../components/confirm";
import { TX, FREQ, type TransactionType, type RecurringFrequency, RECURRING_STATUS } from "@/lib/constants"
import { TRANSACTION_TYPES } from "@/lib/constants";
import { TxTypeBadge } from "../components/badges";
import { getWeekdayShortNamesSundayFirst } from "@/lib/datetime";

type Plan = {
  id: string; name: string; type: string; amountCents: number; frequency: string;
  dayOfMonth: number | null; dayOfWeek: number | null;
  account: string; toAccount?: string; category?: string;
  nextDate: string; status: string; remark: string | null;
  /** 关联账户币种（计划金额为原币）/ account currency (plan amount is native) */
  currencyCode?: string;
};
type AccountOpt = { id: string; name: string; icon: string };
type CatOpt = { id: string; name: string; icon: string; type: string };

/** 新建表单字段（显式声明泛型，避免 useState 从初始值收窄为字面量类型） */
type PlanForm = {
  name: string;
  type: TransactionType;
  amountYuan: string;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  dayOfWeek: number;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  nextDate: string;
  remark: string;
};

/** 周期计划管理：新建表单 + 计划列表（执行/暂停/删除均带确认） */
export function RecurringManager({
  plans,
  accounts,
  categories,
}: {
  plans: Plan[];
  accounts: AccountOpt[];
  categories: CatOpt[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const baseCur = useBaseCurrency();
  // 计划金额为关联账户的原币，按各自币种符号展示 / plan amount is native, shown with the account's own symbol
  const planMoney = (p: Plan) => formatCurrency(p.amountCents, p.currencyCode ?? baseCur, locale);
  // 周日为首的短星期名，随 locale 自动变化
  const weekNames = getWeekdayShortNamesSundayFirst(locale);
  const [form, setForm] = useState<PlanForm>({
    name: "",
    type: TX.expense,
    amountYuan: "",
    frequency: FREQ.monthly,
    dayOfMonth: 1,
    dayOfWeek: 1,
    accountId: accounts[0]?.id ?? "",
    toAccountId: "",
    categoryId: "",
    nextDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlanForm>({
    name: "",
    type: TX.expense,
    amountYuan: "",
    frequency: FREQ.monthly,
    dayOfMonth: 1,
    dayOfWeek: 1,
    accountId: accounts[0]?.id ?? "",
    toAccountId: "",
    categoryId: "",
    nextDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });

  function flash(m: { ok: boolean; text: string }) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  }

  async function doSubmit() {
    const r = await createRecurringPlan({
      name: form.name,
      type: form.type as TransactionType,
      amountYuan: form.amountYuan,
      frequency: form.frequency as RecurringFrequency,
      dayOfMonth: form.frequency === FREQ.monthly ? form.dayOfMonth : undefined,
      dayOfWeek: form.frequency === FREQ.weekly ? form.dayOfWeek : undefined,
      accountId: form.accountId,
      toAccountId: form.type === TX.transfer ? form.toAccountId : undefined,
      categoryId: form.type === TX.transfer ? undefined : form.categoryId || undefined,
      nextDate: form.nextDate,
      remark: form.remark,
    });
    if (r.ok) {
      flash({ ok: true, text: t("common.saved") });
      setForm({ ...form, name: "", amountYuan: "", remark: "" });
      setCreating(false);
    } else {
      flash({ ok: false, text: r.error ?? t("errors.saveFailed") });
    }
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!form.name.trim()) { flash({ ok: false, text: t("common.nameRequired") }); return false; }
    if (!form.amountYuan.trim()) { flash({ ok: false, text: t("common.required") }); return false; }
    if (!form.accountId) { flash({ ok: false, text: t("common.accountRequired") }); return false; }
    if (form.type !== TX.transfer && !form.categoryId) { flash({ ok: false, text: t("common.required") }); return false; }
    return true;
  }

  function startEdit(p: Plan) {
    setEditForm({
      name: p.name,
      type: p.type as TransactionType,
      amountYuan: (p.amountCents / 100).toString(),
      frequency: p.frequency as RecurringFrequency,
      dayOfMonth: p.dayOfMonth ?? 1,
      dayOfWeek: p.dayOfWeek ?? 1,
      accountId: accounts.find((a) => a.name === p.account)?.id ?? "",
      toAccountId: p.toAccount ? accounts.find((a) => a.name === p.toAccount)?.id ?? "" : "",
      categoryId: p.category ? categories.find((c) => c.name === p.category)?.id ?? "" : "",
      nextDate: p.nextDate,
      remark: p.remark ?? "",
    });
    setEditingId(p.id);
  }

  async function doEdit() {
    if (!editingId) return;
    const r = await updateRecurringPlan(editingId, {
      name: editForm.name,
      type: editForm.type as TransactionType,
      amountYuan: editForm.amountYuan,
      frequency: editForm.frequency as RecurringFrequency,
      dayOfMonth: editForm.frequency === FREQ.monthly ? editForm.dayOfMonth : undefined,
      dayOfWeek: editForm.frequency === FREQ.weekly ? editForm.dayOfWeek : undefined,
      accountId: editForm.accountId,
      toAccountId: editForm.type === TX.transfer ? editForm.toAccountId : undefined,
      categoryId: editForm.type === TX.transfer ? undefined : editForm.categoryId || undefined,
      nextDate: editForm.nextDate,
      remark: editForm.remark,
    });
    if (r.ok) {
      flash({ ok: true, text: t("common.saved") });
      setEditingId(null);
    } else {
      flash({ ok: false, text: r.error ?? t("errors.saveFailed") });
    }
  }

  function validateEdit(): boolean {
    if (!editForm.name.trim()) { flash({ ok: false, text: t("common.nameRequired") }); return false; }
    if (!editForm.amountYuan.trim()) { flash({ ok: false, text: t("common.required") }); return false; }
    if (!editForm.accountId) { flash({ ok: false, text: t("common.accountRequired") }); return false; }
    if (editForm.type !== TX.transfer && !editForm.categoryId) { flash({ ok: false, text: t("common.required") }); return false; }
    return true;
  }

  const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500";
  const labelCls = "mb-1 block text-xs text-slate-500";

  const freqLabel: Record<string, string> = {
    daily: t("common.freqDaily"),
    weekly: t("common.freqWeekly"),
    monthly: t("common.freqMonthly"),
    yearly: t("common.freqYearly"),
  };

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
      )}
      {creating ? (
      /* 新建表单 */
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-800">{t("common.add")}</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t("recurring.name")}<span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("common.type")}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })} className={`w-full ${inputCls}`}>
                {TRANSACTION_TYPES.map((o) => (
                  <option key={o.v} value={o.v}>{t(o.key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("common.amount")}<span className="text-red-500">*</span></label>
              <input value={form.amountYuan} onChange={(e) => setForm({ ...form, amountYuan: e.target.value })} inputMode="decimal" className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("common.frequency")}</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RecurringFrequency })} className={`w-full ${inputCls}`}>
                <option value={FREQ.monthly}>{t("common.freqMonthly")}</option>
                <option value={FREQ.daily}>{t("common.freqDaily")}</option>
                <option value={FREQ.weekly}>{t("common.freqWeekly")}</option>
                <option value={FREQ.yearly}>{t("common.freqYearly")}</option>
              </select>
            </div>
            {form.frequency === FREQ.monthly && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfMonth")}</label>
                <select value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {form.frequency === FREQ.weekly && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfWeek")}</label>
                <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>{weekNames[d]}</option>
                  ))}
                </select>
              </div>
            )}
            {form.frequency === FREQ.daily && <div />}
            {form.frequency === FREQ.yearly && <div />}
          </div>
          <div>
            <label className={labelCls}>{t("recurring.nextDate")}</label>
            <input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>{t("common.account")}</label>
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={`w-full ${inputCls}`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>
          {form.type === TX.transfer ? (
            <div>
              <label className={labelCls}>{t("recurring.toAccount")}</label>
              <select value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectAccount")}</option>
                {accounts.filter((a) => a.id !== form.accountId).map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>{t("recurring.category")}<span className="text-red-500">*</span></label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectCategory")}</option>
                {categories.filter((c) => c.type === (form.type === TX.income ? TX.income : TX.expense)).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>{t("common.remark")}</label>
            <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div className="flex items-center gap-2">
            <ConfirmButton
              action={doSubmit}
              beforeOpen={validateBeforeSave}
              title={t("recurring.saveTitle")}
              desc={t("recurring.saveDesc", { name: form.name || t("recurring.newPlan") })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
                {t("common.save")}
              </span>
            </ConfirmButton>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("common.cancel")}</button>
          </div>
        </div>
      </div>
      ) : editingId ? (
      /* 编辑表单 */
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-800">{t("common.edit")}</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t("recurring.name")}<span className="text-red-500">*</span></label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("common.type")}</label>
              <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as TransactionType })} className={`w-full ${inputCls}`}>
                {TRANSACTION_TYPES.map((o) => (
                  <option key={o.v} value={o.v}>{t(o.key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("common.amount")}<span className="text-red-500">*</span></label>
              <input value={editForm.amountYuan} onChange={(e) => setEditForm({ ...editForm, amountYuan: e.target.value })} inputMode="decimal" className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("common.frequency")}</label>
              <select value={editForm.frequency} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value as RecurringFrequency })} className={`w-full ${inputCls}`}>
                <option value={FREQ.monthly}>{t("common.freqMonthly")}</option>
                <option value={FREQ.daily}>{t("common.freqDaily")}</option>
                <option value={FREQ.weekly}>{t("common.freqWeekly")}</option>
                <option value={FREQ.yearly}>{t("common.freqYearly")}</option>
              </select>
            </div>
            {editForm.frequency === FREQ.monthly && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfMonth")}</label>
                <select value={editForm.dayOfMonth} onChange={(e) => setEditForm({ ...editForm, dayOfMonth: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {editForm.frequency === FREQ.weekly && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfWeek")}</label>
                <select value={editForm.dayOfWeek} onChange={(e) => setEditForm({ ...editForm, dayOfWeek: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>{weekNames[d]}</option>
                  ))}
                </select>
              </div>
            )}
            {editForm.frequency === FREQ.daily && <div />}
            {editForm.frequency === FREQ.yearly && <div />}
          </div>
          <div>
            <label className={labelCls}>{t("recurring.nextDate")}</label>
            <input type="date" value={editForm.nextDate} onChange={(e) => setEditForm({ ...editForm, nextDate: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>{t("common.account")}</label>
            <select value={editForm.accountId} onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })} className={`w-full ${inputCls}`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>
          {editForm.type === TX.transfer ? (
            <div>
              <label className={labelCls}>{t("recurring.toAccount")}</label>
              <select value={editForm.toAccountId} onChange={(e) => setEditForm({ ...editForm, toAccountId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectAccount")}</option>
                {accounts.filter((a) => a.id !== editForm.accountId).map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>{t("recurring.category")}<span className="text-red-500">*</span></label>
              <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectCategory")}</option>
                {categories.filter((c) => c.type === (editForm.type === TX.income ? TX.income : TX.expense)).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>{t("common.remark")}</label>
            <input value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div className="flex items-center gap-2">
            <ConfirmButton
              action={doEdit}
              beforeOpen={validateEdit}
              title={t("recurring.saveTitle")}
              desc={t("recurring.saveDesc", { name: editForm.name || t("recurring.newPlan") })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
                {t("common.save")}
              </span>
            </ConfirmButton>
            <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("common.cancel")}</button>
          </div>
        </div>
      </div>
      ) : (
        <>
          {/* 新增按钮 */}
          <button onClick={() => setCreating(true)} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {t("common.add")}
          </button>

          {/* 计划列表 */}
          <div className="space-y-3">
        {plans.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>
        )}
        {plans.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{p.name}</span>
                <TxTypeBadge type={p.type} />
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {freqLabel[p.frequency] ?? p.frequency}
                  {p.frequency === FREQ.monthly && p.dayOfMonth ? ` ${t("recurring.onDay", { n: p.dayOfMonth })}` : ""}
                  {p.frequency === FREQ.weekly && p.dayOfWeek != null ? ` · ${weekNames[p.dayOfWeek]}` : ""}
                </span>
                {p.status === RECURRING_STATUS.paused && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">{t("common.paused")}</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {p.account}{p.toAccount ? ` → ${p.toAccount}` : ""} · {p.category ?? "-"}{p.remark ? ` · ${p.remark}` : ""}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {t("recurring.nextRun")}：{p.nextDate}
              </div>
            </div>
            <div className={`text-right text-base font-bold ${p.type === TX.income ? "text-green-600" : p.type === TX.expense ? "text-red-600" : "text-slate-500"}`}>
              {p.type === TX.income ? "+" : p.type === TX.expense ? "-" : ""}{planMoney(p)}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => startEdit(p)} className="text-xs text-slate-500 hover:text-teal-600 hover:underline">{t("common.edit")}</button>
              <ConfirmButton
                action={async () => { const r = await runRecurringPlan(p.id); flash(r.ok ? { ok: true, text: t("recurring.runOk") } : { ok: false, text: r.error ? t(r.error, { defaultValue: r.error }) : "" }); }}
                title={t("recurring.runTitle")}
                desc={t("recurring.runDesc", { name: p.name })}
                okText={t("recurring.run")}
              >
                <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100">{t("recurring.run")}</span>
              </ConfirmButton>
              <ConfirmButton
                action={async () => { await toggleRecurringPlan(p.id); }}
                title={p.status === RECURRING_STATUS.active ? t("recurring.pauseTitle") : t("recurring.resumeTitle")}
                desc={p.status === RECURRING_STATUS.active ? t("recurring.pauseDesc", { name: p.name }) : t("recurring.resumeDesc", { name: p.name })}
                okText={p.status === RECURRING_STATUS.active ? t("recurring.pause") : t("recurring.resume")}
              >
                <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  {p.status === RECURRING_STATUS.active ? t("recurring.pause") : t("recurring.resume")}
                </span>
              </ConfirmButton>
              <DeleteButton
                action={async () => { await deleteRecurringPlan(p.id); }}
                title={t("recurring.delTitle")}
                desc={t("common.delDesc", { name: p.name })}
                okText={t("common.delete")}
                label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
              />
            </div>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
