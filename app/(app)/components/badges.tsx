"use client";

import { useT } from "@/components/i18n-provider";

/** 共享徽章：交易类型 / 账户类型（i18n） */
export function TxTypeBadge({ type }: { type: string }) {
  const t = useT();
  const map: Record<string, { key: string; cls: string }> = {
    income: { key: "common.income", cls: "bg-green-50 text-green-700" },
    expense: { key: "common.expense", cls: "bg-red-50 text-red-700" },
    transfer: { key: "common.transfer", cls: "bg-blue-50 text-blue-700" },
  };
  const m = map[type] ?? map.expense;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {t(m.key)}
    </span>
  );
}

export function AccountTypeBadge({ type }: { type: string }) {
  const t = useT();
  const keys: Record<string, string> = {
    cash: "acctType.cash", debit_card: "acctType.debitCard", credit_card: "acctType.creditCard",
    wechat: "acctType.wechat", savings: "acctType.savings", investment: "acctType.investment",
    fund: "acctType.fund", precious_metal: "acctType.preciousMetal", bond: "acctType.bond",
    foreign_currency: "acctType.foreignCurrency", custom: "acctType.custom",
  };
  return (
    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
      {keys[type] ? t(keys[type]) : type}
    </span>
  );
}
