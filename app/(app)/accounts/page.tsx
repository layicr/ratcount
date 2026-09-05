import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { listAccountsWithBalance, listCurrencies } from "@/lib/queries";
import { AccountsManager } from "./accounts-manager";

/** 账户：列表 + 新增/编辑/删除 */
export default async function AccountsPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const locale = await getLocale();
  const d = getDictionary(locale);
  if (!ledger) redirect("/login");
  const [accts, curs] = await Promise.all([listAccountsWithBalance(ledger.id), listCurrencies()]);
  const currencyList = curs.filter((c) => c.isActive).map((c) => ({
    code: c.code,
    name: locale === "en" ? c.nameEn || c.code : c.nameZh || c.code,
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
