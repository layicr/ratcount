import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope"
import { tags } from "@/db/schema";
import { requireCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";
import { TagsManager } from "./tags-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 标签管理，独立页面 /tags */
export default async function TagsPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
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
