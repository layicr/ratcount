import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { getInvestmentById, listAccountsWithBalance, listTags, listProjects, listHoldingTags } from "@/lib/queries";
import { InvestmentForm } from "../../../components/investment-form";
import { investmentListHref } from "@/lib/investment-types";
import { INVESTMENT_STATUS } from "@/lib/constants";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 编辑持仓：独立页面，按 id 取回持仓（带账本隔离校验），返回原管理页 */
export default async function EditInvestmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const ledger = await requireCurrentLedger();
  const { id } = await params;
  const h = await getInvestmentById(id, ledger.id);
  if (!h) redirect("/investments");
  // 已卖出 / 已到期为已结算记录：只读，直接访问编辑页时回管理页
  if (h.status !== INVESTMENT_STATUS.active) redirect(investmentListHref(h.type, h.subType));

  const [accts, tags, projects, holdingTagMap] = await Promise.all([
    listAccountsWithBalance(ledger.id),
    listTags(ledger.id),
    listProjects(ledger.id),
    listHoldingTags(ledger.id, [id]),
  ]);
  const d = (await getMessages()) as unknown as AppDict;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800">{d.common.dialogs.editTitle}</h1>
      <InvestmentForm
        key={id} // 换持仓时强制重新挂载，保证标签等初始值按当前持仓回显
        type={h.type}
        initial={{ ...h, tagIds: (holdingTagMap.get(id) ?? []).map((tg) => tg.id) }}
        accounts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, balanceCents: a.balanceCents, accountType: a.type }))}
        backHref={investmentListHref(h.type, h.subType)}
        tags={tags}
        projects={projects}
      />
    </div>
  );
}
