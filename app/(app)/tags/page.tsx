import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { tags } from "@/db/schema";
import { TagsManager } from "./tags-manager";

/** 标签管理，独立页面 /tags */
export default async function TagsPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) redirect("/login");
  const tgs = await db.select().from(tags).where(eq(tags.ledgerId, ledger.id));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.nav.tags}</h1>
      <TagsManager
        tags={tgs.map((t) => ({ id: t.id, name: t.name, color: t.color, remark: t.remark ?? null }))}
      />
    </div>
  );
}
