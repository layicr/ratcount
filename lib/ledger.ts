import { ledgers, ledgerMembers } from "@/db/schema"
import { LOGIN_PATH, MR, LEDGER_COOKIE } from "@/lib/constants";
import { requireUser } from "@/lib/scope"



import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";



import { randomLedgerName } from "@/lib/ledger-name";

/** 当前用户可见的账本（含成员角色）/ Ledgers visible to the user (with member role) */
export const getMyLedgers = cache(async (userId: string) => {
  return db
    .select({ ledger: ledgers, role: ledgerMembers.role })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
    .where(eq(ledgerMembers.userId, userId));
});

/** 当前选中账本 ID（cookie 优先，回退第一个）/ Current selected ledger id (cookie first, else first) */
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

/**
 * 页面级账本守卫：取当前账本，无账本时 redirect 到 /login。
 * 收口各 page.tsx 中重复的 `getCurrentLedger()` + `if (!ledger) redirect("/login")`，
 * 返回类型为非空账本，调用处无需再做空值收窄。
 * Page-level ledger guard: fetch the current ledger, redirect to /login when none.
 * Consolidates the repeated `getCurrentLedger()` + `if (!ledger) redirect("/login")` in page.tsx,
 * returning a non-null ledger so callers need no extra null-narrowing.
 */
export async function requireCurrentLedger() {
  const ledger = await getCurrentLedger();
  if (!ledger) redirect(LOGIN_PATH);
  return ledger;
}

/**
 * 确保登录用户至少有一个账本：没有就自动创建一个随机默认账本并设为 owner。
 * 返回当前应选用的账本 id，用于在 layout 等场景避免「暂无账本」卡死。
 * 创建包在事务内并二次确认，避免并发/严格模式双渲染导致重复建账本。
 * Ensure the signed-in user has at least one ledger: create a random default and set as owner if none.
 * Returns the ledger id to use now, avoiding a "no ledger" dead-end in layout etc.
 * Creation runs in a transaction with a double-check to avoid duplicate ledgers from concurrent/strict-mode double render.
 */
export async function ensureDefaultLedger(userId: string, locale?: string): Promise<string> {
  const existing = await getMyLedgers(userId);
  if (existing.length > 0) return existing[0].ledger.id;

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: ledgers.id })
      .from(ledgerMembers)
      .innerJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
      .where(eq(ledgerMembers.userId, userId));
    if (rows.length > 0) return rows[0].id;

    const [ledger] = await tx
      .insert(ledgers)
      .values({ name: randomLedgerName(locale ?? ""), createdBy: userId })
      .returning();
    await tx.insert(ledgerMembers).values({
      ledgerId: ledger.id,
      userId,
      role: MR.owner,
    });
    return ledger.id;
  });
}
