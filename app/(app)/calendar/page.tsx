import { accounts, categories, transactions } from "@/db/schema"
import { requireUser } from "@/lib/scope"
import { and, eq, gte, lte } from "drizzle-orm";
import { requireCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";




import { CalendarView } from "./calendar-view";
import { monthRange } from "@/lib/sql-utils";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

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
  const ledger = await requireCurrentLedger();
  const sp = await searchParams;
  const d = (await getMessages()) as unknown as AppDict;

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  // 用「>= 月初 AND <= 月末」范围查询命中 (ledgerId, txDate) 索引；
  // 原 LIKE 'YYYY-MM-%' 前缀匹配在 SQLite 下不走索引，会退化为全账本扫描
  const [yearNum, monthNum] = month.split("-").map(Number);
  const { start: monthStart, end: monthEnd } = monthRange(yearNum, monthNum);

  const [rows, accts, cats] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.ledgerId, ledger.id),
        gte(transactions.txDate, monthStart),
        lte(transactions.txDate, monthEnd),
      ))
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
    currencyCode: r.currencyCode,
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
