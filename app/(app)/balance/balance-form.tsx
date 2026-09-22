"use client";

import { useState } from "react";
import { recordBalance } from "@/app/actions/balances";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/currency-context";
import { ConfirmButton } from "../components/confirm";

/** 记录余额快照表单（i18n） */
export function BalanceForm({
  accounts,
}: {
  accounts: { id: string; name: string; icon: string; balanceCents: number }[];
}) {
  const t = useTranslations();
  const money = useMoney();
  const [accountId, setAccountId] = useState("");
  const [balanceYuan, setBalance] = useState("");
  const [snapshotDate, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const selected = accounts.find((a) => a.id === accountId);

  async function doSubmit() {
    setErr(null);
    setOk(false);
    const r = await recordBalance({ accountId, balanceYuan, snapshotDate, remark });
    if (r.ok) {
      setOk(true);
      setBalance("");
      setRemark("");
    } else setErr(r.error);
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateBeforeSave(): boolean {
    if (!accountId) { setErr("common.accountRequired"); return false; }
    if (!balanceYuan.trim()) { setErr("common.balanceRequired"); return false; }
    return true;
  }

  return (
    <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 h-fit">
      <h2 className="text-sm font-bold text-slate-800">{t("balance.record")}</h2>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("common.account")}</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
          <option value="">{t("balance.selectAccount")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </select>
        {selected && (
          <p className="mt-1 text-[11px] text-slate-400">{t("balance.curBalance", { amount: money(selected.balanceCents) })}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("common.save")}</label>
        <input value={balanceYuan} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder={t("balance.amountPlaceholder")} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("balance.snapshotDate")}</label>
        <input type="date" value={snapshotDate} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">{t("balance.remark")}</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err, { defaultValue: err })}</p>}
      {ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{t("balance.saved")}</p>}
      <ConfirmButton
        action={doSubmit}
        beforeOpen={validateBeforeSave}
        title={t("balance.saveTitle")}
        desc={t("balance.saveDesc", { amount: balanceYuan || "0.00" })}
        okText={t("common.save")}
        className="flex w-full justify-center"
      >
        <span className="rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 px-8 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:from-teal-700 hover:to-teal-600 hover:shadow active:scale-[0.99]">{t("common.save")}</span>
      </ConfirmButton>
    </form>
  );
}
