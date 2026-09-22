"use client";

import { useTranslations } from "next-intl";
import { accountTypeI18nKey, TX, transactionTypeI18nKey } from "@/lib/constants";

/** 交易类型 → 徽章配色（本组件只管颜色；文案 key 由 lib/constants 派生） */
const TX_BADGE_CLS: Record<string, string> = {
  [TX.income]: "bg-green-50 text-green-700",
  [TX.expense]: "bg-red-50 text-red-700",
  [TX.transfer]: "bg-blue-50 text-blue-700",
};

/** 共享徽章：交易类型 / 账户类型（i18n） */
export function TxTypeBadge({ type }: { type: string }) {
  const t = useTranslations();
  // 未知类型回退支出（文案与配色回退保持一致）
  const resolved = TX_BADGE_CLS[type] ? type : TX.expense;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TX_BADGE_CLS[resolved]}`}>
      {t(transactionTypeI18nKey(resolved))}
    </span>
  );
}

export function AccountTypeBadge({ type }: { type: string }) {
  const t = useTranslations();
  // i18n key 统一从 lib/constants 派生，新增账户类型无需改此处
  const key = accountTypeI18nKey(type);
  return (
    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
      {(() => { try { return t(key); } catch { return type; } })()}
    </span>
  );
}
