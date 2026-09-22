import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { listAccountsWithBalance, listCurrencies } from "@/lib/queries";
import { AccountsManager } from "./accounts-manager";
import { getMessages, getLocale } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 账户：列表 + 新增/编辑/删除 */
export default async function AccountsPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const locale = await getLocale();
  const d = (await getMessages()) as unknown as AppDict;
  const [accts, curs] = await Promise.all([listAccountsWithBalance(ledger.id), listCurrencies()]);
  const currencyList = curs.filter((c) => c.isActive).map((c) => ({
    code: c.code,
    name: c.name || c.code,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">{d.accounts.title}</h1>
      </div>
      <AccountsManager
        accts={accts.map((a) => ({ ...a, openingYuan: (a.openingBalanceCents / 100).toFixed(2) }))}
        currencies={currencyList}
      />
    </div>
  );
}
