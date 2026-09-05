import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { categories } from "@/db/schema";
import { CategoriesManager } from "../tags/tags-manager";

/** 分类管理（收入 / 支出），独立页面 /categories */
export default async function CategoriesPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
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
