import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope"
import { type InvestmentType } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { listAccountsWithBalance, listTags, listProjects } from "@/lib/queries";
import { InvestmentForm } from "../../components/investment-form";
import { isValidInvestmentType, isValidMetalSubType, investmentListHref } from "@/lib/investment-types";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 新增持仓：独立页面，按 ?type= 区分投资类型（?sub= 仅贵金属预选品种） */
export default async function NewInvestmentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sub?: string }>;
}) {
  await requireUser();
  const ledger = await requireCurrentLedger();
  const sp = await searchParams;
  if (!sp.type || !isValidInvestmentType(sp.type)) redirect("/investments");
  const type = sp.type as InvestmentType;
  const sub = sp.sub && isValidMetalSubType(sp.sub) ? sp.sub : undefined;

  const accts = await listAccountsWithBalance(ledger.id);
  const d = (await getMessages()) as unknown as AppDict;
  const tags = await listTags(ledger.id);
  const projects = await listProjects(ledger.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800">{d.common.dialogs.addTitle}</h1>
      <InvestmentForm
        type={type}
        accounts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, balanceCents: a.balanceCents, accountType: a.type }))}
        backHref={investmentListHref(type, sub)}
        defaultSubType={sub}
        tags={tags}
        projects={projects}
      />
    </div>
  );
}
