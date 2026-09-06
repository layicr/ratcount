"use client";

import { useState } from "react";
import {
  createRecurringPlan,
  deleteRecurringPlan,
  toggleRecurringPlan,
  runRecurringPlan,
} from "@/app/actions/recurring";
import { useT, useLocale } from "@/components/i18n-provider";
import { ConfirmButton, DeleteButton } from "../components/confirm";
import { TxTypeBadge } from "../components/badges";
import { formatCents } from "@/lib/money";

type Plan = {
  id: string; name: string; type: string; amountCents: number; frequency: string;
  dayOfMonth: number | null; dayOfWeek: number | null;
  account: string; toAccount?: string; category?: string;
  nextDate: string; status: string; remark: string | null;
};
type AccountOpt = { id: string; name: string; icon: string };
type CatOpt = { id: string; name: string; icon: string; type: string };

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
  const t = useT();
  const locale = useLocale();
  const weekNames = locale === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const [form, setForm] = useState({
    name: "",
    type: "expense",
    amountYuan: "",
    frequency: "monthly",
    dayOfMonth: 1,
    dayOfWeek: 1,
    accountId: accounts[0]?.id ?? "",
    toAccountId: "",
    categoryId: "",
    nextDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(m: { ok: boolean; text: string }) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  }

  async function doSubmit() {
    const r = await createRecurringPlan({
      name: form.name,
      type: form.type as "income" | "expense" | "transfer",
      amountYuan: form.amountYuan,
      frequency: form.frequency as "daily" | "weekly" | "monthly" | "yearly",
      dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : undefined,
      dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : undefined,
      accountId: form.accountId,
      toAccountId: form.type === "transfer" ? form.toAccountId : undefined,
      categoryId: form.type === "transfer" ? undefined : form.categoryId || undefined,
      nextDate: form.nextDate,
      remark: form.remark,
    });
    if (r.ok) {
      flash({ ok: true, text: t("common.saved") });
      setForm({ ...form, name: "", amountYuan: "", remark: "" });
    } else {
      flash({ ok: false, text: r.error ?? t("common.saveFailed") });
    }
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!form.name.trim()) { flash({ ok: false, text: t("common.nameRequired") }); return false; }
    if (!form.amountYuan.trim()) { flash({ ok: false, text: t("common.amountRequired") }); return false; }
    if (!form.accountId) { flash({ ok: false, text: t("common.accountRequired") }); return false; }
    return true;
  }

  const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500";
  const labelCls = "mb-1 block text-xs text-slate-500";

  const freqLabel: Record<string, string> = {
    daily: t("recurring.freqDaily"),
    weekly: t("recurring.freqWeekly"),
    monthly: t("recurring.freqMonthly"),
    yearly: t("recurring.freqYearly"),
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* 新建表单 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("recurring.add")}</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t("recurring.name")}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("recurring.type")}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="expense">{t("tx.expense")}</option>
                <option value="income">{t("tx.income")}</option>
                <option value="transfer">{t("tx.transfer")}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("recurring.amount")}</label>
              <input value={form.amountYuan} onChange={(e) => setForm({ ...form, amountYuan: e.target.value })} inputMode="decimal" className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t("recurring.frequency")}</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="monthly">{t("recurring.freqMonthly")}</option>
                <option value="daily">{t("recurring.freqDaily")}</option>
                <option value="weekly">{t("recurring.freqWeekly")}</option>
                <option value="yearly">{t("recurring.freqYearly")}</option>
              </select>
            </div>
            {form.frequency === "monthly" && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfMonth")}</label>
                <select value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {form.frequency === "weekly" && (
              <div>
                <label className={labelCls}>{t("recurring.dayOfWeek")}</label>
                <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} className={`w-full ${inputCls}`}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>{weekNames[d]}</option>
                  ))}
                </select>
              </div>
            )}
            {form.frequency === "daily" && <div />}
            {form.frequency === "yearly" && <div />}
          </div>
          <div>
            <label className={labelCls}>{t("recurring.nextDate")}</label>
            <input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>{t("recurring.account")}</label>
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={`w-full ${inputCls}`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>
          {form.type === "transfer" ? (
            <div>
              <label className={labelCls}>{t("recurring.toAccount")}</label>
              <select value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectAccount")}</option>
                {accounts.filter((a) => a.id !== form.accountId).map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>{t("recurring.category")}</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={`w-full ${inputCls}`}>
                <option value="">{t("recurring.selectCategory")}</option>
                {categories.filter((c) => c.type === (form.type === "income" ? "income" : "expense")).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>{t("common.remark")}</label>
            <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className={`w-full ${inputCls}`} />
          </div>
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
          {msg && (
            <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
          )}
        </div>
      </div>

      {/* 计划列表 */}
      <div className="lg:col-span-2 space-y-3">
        {plans.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">{t("recurring.empty")}</p>
        )}
        {plans.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{p.name}</span>
                <TxTypeBadge type={p.type} />
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {freqLabel[p.frequency] ?? p.frequency}
                  {p.frequency === "monthly" && p.dayOfMonth ? ` ${t("recurring.onDay", { n: p.dayOfMonth })}` : ""}
                  {p.frequency === "weekly" && p.dayOfWeek != null ? ` · ${weekNames[p.dayOfWeek]}` : ""}
                </span>
                {p.status === "paused" && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">{t("recurring.paused")}</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {p.account}{p.toAccount ? ` → ${p.toAccount}` : ""} · {p.category ?? "-"}{p.remark ? ` · ${p.remark}` : ""}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {t("recurring.nextRun")}：{p.nextDate}
              </div>
            </div>
            <div className={`text-right text-base font-bold ${p.type === "income" ? "text-green-600" : p.type === "expense" ? "text-red-600" : "text-slate-500"}`}>
              {p.type === "income" ? "+" : p.type === "expense" ? "-" : ""}¥ {formatCents(p.amountCents)}
            </div>
            <div className="flex items-center gap-1">
              <ConfirmButton
                action={async () => { const r = await runRecurringPlan(p.id); flash(r.ok ? { ok: true, text: t("recurring.runOk") } : { ok: false, text: r.error ?? "" }); }}
                title={t("recurring.runTitle")}
                desc={t("recurring.runDesc", { name: p.name })}
                okText={t("recurring.run")}
              >
                <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100">{t("recurring.run")}</span>
              </ConfirmButton>
              <ConfirmButton
                action={async () => { await toggleRecurringPlan(p.id); }}
                title={p.status === "active" ? t("recurring.pauseTitle") : t("recurring.resumeTitle")}
                desc={p.status === "active" ? t("recurring.pauseDesc", { name: p.name }) : t("recurring.resumeDesc", { name: p.name })}
                okText={p.status === "active" ? t("recurring.pause") : t("recurring.resume")}
              >
                <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  {p.status === "active" ? t("recurring.pause") : t("recurring.resume")}
                </span>
              </ConfirmButton>
              <DeleteButton
                action={async () => { await deleteRecurringPlan(p.id); }}
                title={t("recurring.delTitle")}
                desc={t("recurring.delDesc", { name: p.name })}
                okText={t("common.delete")}
                label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
