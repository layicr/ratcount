"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { createTransaction, updateTransaction } from "@/app/actions/transactions";
import { ConfirmButton } from "../components/confirm";
import { formatCents } from "@/lib/money";

/** 记一笔表单：类型切换 + 账户/分类/项目/标签（i18n） */
export function AddForm({
  accts, cats, projs, tgs, initialTx, isEdit = false,
}: {
  accts: { id: string; name: string; icon: string; balanceCents: number }[];
  cats: { id: string; name: string; icon: string; type: string }[];
  projs: { id: string; name: string; icon: string }[];
  tgs: { id: string; name: string; color: string }[];
  initialTx?: {
    id: string;
    type: "expense" | "income" | "transfer";
    amountYuan: string;
    accountId: string;
    toAccountId?: string;
    categoryId?: string;
    projectId?: string;
    tagIds: string[];
    txDate: string;
    remark: string;
  };
  isEdit?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [type, setType] = useState<"expense" | "income" | "transfer">(initialTx?.type ?? "expense");
  const [amountYuan, setAmount] = useState(initialTx?.amountYuan ?? "");
  const [accountId, setAccountId] = useState(initialTx?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(initialTx?.toAccountId ?? "");
  const [categoryId, setCategoryId] = useState(initialTx?.categoryId ?? "");
  const [projectId, setProjectId] = useState(initialTx?.projectId ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initialTx?.tagIds ?? []);
  const [txDate, setTxDate] = useState(initialTx?.txDate ?? new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState(initialTx?.remark ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const catList = cats.filter((c) => (type === "income" ? c.type === "income" : c.type === "expense"));
  const acctOptions = accts.filter((a) => a.id !== toAccountId);

  async function doSubmit() {
    setErr(null);
    setPending(true);
    const input = {
      type, accountId,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      projectId: projectId || undefined,
      amountYuan, txDate, remark, tagIds,
    };
    const r = isEdit && initialTx
      ? await updateTransaction(initialTx.id, input)
      : await createTransaction(input);
    setPending(false);
    if (r.ok) {
      router.push("/transactions");
      router.refresh();
    } else setErr(r.error);
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!amountYuan.trim()) { setErr(t("common.amountRequired")); return false; }
    if (!accountId) { setErr(t("common.accountRequired")); return false; }
    if (type === "transfer" && !toAccountId) { setErr(t("common.toAccountRequired")); return false; }
    if (type !== "transfer" && !categoryId) { setErr(t("common.categoryRequired")); return false; }
    return true;
  }

  const typeTab = (v: "expense" | "income" | "transfer", label: string, cls: string) => (
    <button
      type="button"
      onClick={() => setType(v)}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${type === v ? cls : "bg-slate-50 text-slate-500"}`}
    >
      {label}
    </button>
  );

  return (
    <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      {/* 类型切换 */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {typeTab("expense", t("common.expense"), "bg-red-500 text-white")}
        {typeTab("income", t("common.income"), "bg-green-600 text-white")}
        {typeTab("transfer", t("common.transfer"), "bg-blue-600 text-white")}
      </div>

      {/* 金额 */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("add.amount")}</label>
        <input
          value={amountYuan}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="w-full rounded-xl border border-slate-200 px-3 py-3 text-2xl font-bold text-slate-900 outline-none focus:border-teal-500"
        />
      </div>

      {/* 账户 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">{type === "transfer" ? t("add.fromAccount") : t("add.account")}</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
            <option value="">{t("add.plsSelect")}</option>
            {acctOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name} (¥{formatCents(a.balanceCents)})</option>
            ))}
          </select>
        </div>
        {type === "transfer" && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">{t("add.toAccount")}</label>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="">{t("add.plsSelect")}</option>
              {accts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name} (¥{formatCents(a.balanceCents)})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 分类 */}
      {type !== "transfer" && (
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("add.category")}</label>
          <div className="flex flex-wrap gap-1.5">
            {catList.length === 0 && <span className="text-xs text-slate-400">{t("add.noCategory")}</span>}
            {catList.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${categoryId === c.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 项目 + 日期 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("add.project")}</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
            <option value="">{t("add.noAssociate")}</option>
            {projs.map((p) => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("common.date")}</label>
          <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
        </div>
      </div>

      {/* 标签 */}
      {tgs.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("add.tags")}</label>
          <div className="flex flex-wrap gap-1.5">
            {tgs.map((tg) => (
              <button
                type="button"
                key={tg.id}
                onClick={() => setTagIds((prev) => prev.includes(tg.id) ? prev.filter((x) => x !== tg.id) : [...prev, tg.id])}
                className={`rounded-full px-3 py-1 text-xs transition ${tagIds.includes(tg.id) ? "text-white" : "bg-slate-100 text-slate-600"}`}
                style={tagIds.includes(tg.id) ? { background: tg.color } : undefined}
              >
                {tg.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 备注 */}
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("common.remark")}</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={200} placeholder={t("add.remarkPlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" />
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}

      <div className="flex gap-2">
        <ConfirmButton
          action={doSubmit}
          beforeOpen={validateBeforeSave}
          title={isEdit ? t("add.editTitle") : t("add.saveTitle")}
          desc={isEdit ? t("add.editDesc", { amount: amountYuan || "0.00" }) : t("add.saveDesc", { amount: amountYuan || "0.00", type: t(type === "income" ? "common.income" : type === "expense" ? "common.expense" : "common.transfer") })}
          okText={t("common.save")}
        >
          <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {pending ? t("add.saving") : t("add.save")}
          </span>
        </ConfirmButton>
        <button
          type="button"
          onClick={() => router.push("/transactions")}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
