import { requireUser } from "@/lib/scope"
import { PROTECTION_ACCOUNT_TYPES, DEFAULT_CURRENCY } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { AccountGroupSummary } from "../components/account-group-summary";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 保障总览：保险 + 公积金 的余额、分类小计、近期流水、缴费计划 */
export default async function ProtectionPage() {
  await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-bold text-slate-800">{d.nav.protectionOverview}</h1>
      <AccountGroupSummary
        ledgerId={ledger.id}
        types={PROTECTION_ACCOUNT_TYPES}
        d={d}
        currency={ledger.baseCurrencyCode ?? DEFAULT_CURRENCY}
      />
    </div>
  );
}
