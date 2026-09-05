import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { recurringPlans, accounts, categories } from "@/db/schema";
import { RecurringManager } from "./recurring-manager";

/** 周期计划：按频率生成周期性流水（账单重复、固定收支等） */
export default async function RecurringPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");

  const [plans, accts, cats] = await Promise.all([
    db.select().from(recurringPlans).where(eq(recurringPlans.ledgerId, ledger.id)),
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
  ]);
  const acctMap = new Map(accts.map((a) => [a.id, a]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.recurring.title}</h1>
      <RecurringManager
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          amountCents: p.amountCents,
          frequency: p.frequency,
          dayOfMonth: p.dayOfMonth,
          dayOfWeek: p.dayOfWeek,
          account: acctMap.get(p.accountId)?.name ?? "-",
          toAccount: p.toAccountId ? (acctMap.get(p.toAccountId)?.name ?? "-") : undefined,
          category: p.categoryId ? (catMap.get(p.categoryId)?.name ?? "-") : undefined,
          nextDate: p.nextDate,
          status: p.status,
          remark: p.remark,
        }))}
        accounts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon }))}
        categories={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: c.type }))}
      />
    </div>
  );
}
