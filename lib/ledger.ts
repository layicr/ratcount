import { cookies } from "next/headers";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerMembers, ledgers } from "@/db/schema";
import { requireUser } from "@/lib/scope";

/** 当前账本 cookie 名 / Cookie key for current ledger */
export const LEDGER_COOKIE = "ratcount_ledger";

/** 当前用户可见的账本（含成员角色）/ Ledgers visible to the user */
export async function getMyLedgers(userId: string) {
  return db
    .select({ ledger: ledgers, role: ledgerMembers.role })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
    .where(eq(ledgerMembers.userId, userId));
}

/** 当前选中账本 ID（cookie 优先，回退第一个）/ Current ledger id */
export async function getCurrentLedgerId(): Promise<string | null> {
  const user = await requireUser();
  const rows = await getMyLedgers(user.id);
  if (rows.length === 0) return null;
  const store = await cookies();
  const cookie = store.get(LEDGER_COOKIE)?.value;
  if (cookie && rows.some((r) => r.ledger.id === cookie)) return cookie;
  return rows[0].ledger.id;
}

/** 当前账本对象 / Current ledger record */
export const getCurrentLedger = cache(async () => {
  const id = await getCurrentLedgerId();
  if (!id) return null;
  const [ledger] = await db.select().from(ledgers).where(eq(ledgers.id, id)).limit(1);
  return ledger ?? null;
});
