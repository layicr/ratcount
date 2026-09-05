import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { transactions, accounts, categories } from "@/db/schema";
import { CalendarView } from "./calendar-view";

function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

/** 收支日历：按月日历视图展示每日收支汇总，点击日期查看当日流水 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const sp = await searchParams;
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const prefix = `${month}-%`;

  const [rows, accts, cats] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.ledgerId, ledger.id), sql`${transactions.txDate} LIKE ${prefix}`))
      .orderBy(transactions.txDate),
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
  ]);
  const acctMap = new Map(accts.map((a) => [a.id, a]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  const txs = rows.map((r) => ({
    id: r.id,
    txDate: r.txDate,
    type: r.type,
    amountCents: r.amountCents,
    account: acctMap.get(r.accountId)?.name ?? "-",
    toAccount: r.toAccountId ? (acctMap.get(r.toAccountId)?.name ?? "-") : undefined,
    category: r.categoryId ? (catMap.get(r.categoryId)?.name ?? "-") : undefined,
    remark: r.remark,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.calendar.title}</h1>
      <CalendarView month={month} txs={txs} today={currentMonth()} />
    </div>
  );
}
