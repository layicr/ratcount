import { accounts, categories, recurringPlans } from "@/db/schema"
import { requireUser } from "@/lib/scope"
import { eq } from "drizzle-orm";
import { requireCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";




import { RecurringManager } from "./recurring-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 周期计划：按频率生成周期性流水（账单重复、固定收支等） */
export default async function RecurringPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

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
          // 计划金额按关联账户币种存储：展示时用该账户的币种符号 / plan amount is in the account's currency
          currencyCode: acctMap.get(p.accountId)?.currencyCode,
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
