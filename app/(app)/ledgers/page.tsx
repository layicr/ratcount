import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedgerId, getMyLedgers } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { ledgerMembers, currencies } from "@/db/schema";
import { LedgersManager } from "./ledgers-manager";

/** 账本管理页面：当前用户所属的所有账本（创建/编辑/删除/切换） */
export default async function LedgersPage() {
  const user = await requireUser();
  const currentId = await getCurrentLedgerId();
  const d = getDictionary(await getLocale());
  if (!currentId) redirect("/login");

  // 查询当前用户的所有账本 + 每个账本的成员数
  const myLedgers = await getMyLedgers(user.id);
  const locale = await getLocale();
  const curs = await db.select({ code: currencies.code, nameZh: currencies.nameZh, nameEn: currencies.nameEn }).from(currencies).where(eq(currencies.isActive, true));
  const currencyList = curs.map((c) => ({ code: c.code, name: locale === "en" ? c.nameEn || c.code : c.nameZh || c.code }));

  // 批量查询每个账本的成员数
  const memberCounts = await db
    .select({
      ledgerId: ledgerMembers.ledgerId,
      count: sql<number>`count(*)`.as("cnt"),
    })
    .from(ledgerMembers)
    .where(sql`${ledgerMembers.ledgerId} in (${sql.join(myLedgers.map((l) => sql`${l.ledger.id}`), sql`, `)})`)
    .groupBy(ledgerMembers.ledgerId);

  const countMap = new Map(memberCounts.map((m) => [m.ledgerId, Number(m.count)]));

  const ledgers = myLedgers.map(({ ledger, role }) => ({
    id: ledger.id,
    name: ledger.name,
    icon: ledger.icon,
    baseCurrencyCode: ledger.baseCurrencyCode,
    remark: ledger.remark,
    createdAt: ledger.createdAt,
    role,
    memberCount: countMap.get(ledger.id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.nav.ledgers}</h1>
      <LedgersManager
        ledgers={ledgers}
        currentId={currentId}
        currencies={currencyList}
      />
    </div>
  );
}
