import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { projectSummary } from "@/lib/queries";
import { ProjectsManager } from "./projects-manager";

/** 项目：列表（盈亏 + 预算进度）+ 新增/删除 */
export default async function ProjectsPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
  const rows = await projectSummary(ledger.id);

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
