import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, SETTINGS_PATH } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { listCurrencies } from "@/lib/queries";
import { CurrencyManager } from "./currency-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 币种管理界面（独立页面 /settings/currencies，仅管理员） */
export default async function CurrenciesPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  if (user.role !== ROLE.admin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
        <Link href={SETTINGS_PATH} className="mt-3 inline-block text-sm text-teal-600 hover:underline">
          ← {d.nav.settings}
        </Link>
      </div>
    );
  }

  const curs = await listCurrencies();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={SETTINGS_PATH} className="text-sm text-slate-500 hover:text-teal-600">
          ← {d.nav.settings}
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{d.settings.currencyMgmt}</h1>
      </div>
      <CurrencyManager
        currencies={curs.map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          rate: parseFloat(c.rate),
          isActive: c.isActive,
          isBase: c.isBase,
          remark: c.remark ?? null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))}
      />
    </div>
  );
}
