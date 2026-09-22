"use server";

// ratcount · 我的菜单配置（读保留，写抽服务）/ My menu config (read kept, write delegated)
//  - saveLedgerMenu 的写逻辑已抽到 lib/services/profile；getLedgerMenuIds 为读，保持服务端行为不变。
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentLedger } from "@/lib/ledger";
import { menus, userMenuConfig } from "@/db/schema";
import { MENU_STATUS } from "@/lib/constants";
import { requireUser } from "@/lib/scope";
import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/profile";

export async function getLedgerMenuIds(ledgerId: string, userId: string) {
  const allowed = new Set(
    (await db.select({ menuId: menus.menuId }).from(menus).where(eq(menus.statusCode, MENU_STATUS.active))).map((r) => r.menuId),
  );
  const cfg = await db
    .select({ menuId: menus.menuId })
    .from(menus)
    .innerJoin(userMenuConfig, eq(userMenuConfig.menuId, menus.menuId))
    .where(and(eq(userMenuConfig.userId, userId), eq(userMenuConfig.ledgerId, ledgerId)));
  const ids = cfg.map((c) => c.menuId).filter((id) => allowed.has(id));
  return ids.length ? ids : [...allowed];
}

export async function saveLedgerMenu(menuIds: string[]) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) return { ok: false as const, error: "errors.noLedger" };
  const r = await svc.saveLedgerMenuService({ id: user.id, role: user.role }, ledger.id, menuIds);
  if (r.ok) {
    revalidatePath("/", "layout");
    revalidatePath("/profile/menu");
  }
  return r;
}
