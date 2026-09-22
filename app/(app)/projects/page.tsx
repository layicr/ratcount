import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { projectSummary } from "@/lib/queries";
import { getResolvedTimeZone } from "@/lib/settings";
import { ProjectsManager } from "./projects-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 项目：列表（盈亏 + 预算进度）+ 新增/删除 */
export default async function ProjectsPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  const rows = await projectSummary(ledger.id, undefined, await getResolvedTimeZone());

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.projects.title}</h1>
      <ProjectsManager
        projects={rows.map((r) => ({
          id: r.id, name: r.name, icon: r.icon, status: r.status,
          income: r.income, expense: r.expense, balance: r.balance,
          budgetCents: r.budgetCents, remark: r.remark ?? null,
        }))}
      />
    </div>
  );
}
