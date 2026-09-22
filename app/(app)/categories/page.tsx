import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope"
import { categories } from "@/db/schema";
import { requireCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";
import { CategoriesManager } from "./categories-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 分类管理（收入 / 支出），独立页面 /categories */
export default async function CategoriesPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  const cats = await db.select().from(categories).where(eq(categories.ledgerId, ledger.id));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.nav.categories}</h1>
      <CategoriesManager
        cats={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: c.type, remark: c.remark ?? null }))}
      />
    </div>
  );
}
