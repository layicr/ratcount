import { projects, tags, categories } from "@/db/schema"
import { requireUser } from "@/lib/scope"
import { eq } from "drizzle-orm";
import { requireCurrentLedger } from "@/lib/ledger";
import { listAccountsWithBalance } from "@/lib/queries";
import { db } from "@/lib/db";




import { AddForm } from "./add-form";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 记一笔：取账本基础数据交给客户端表单 */
export default async function AddPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  const [accts, cats, projs, tgs] = await Promise.all([
    listAccountsWithBalance(ledger.id),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)).orderBy(categories.sort, categories.name),
    db.select().from(projects).where(eq(projects.ledgerId, ledger.id)),
    db.select().from(tags).where(eq(tags.ledgerId, ledger.id)),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-lg font-bold text-slate-900">{d.add.title}</h1>
      <AddForm
        accts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, type: a.type, balanceCents: a.balanceCents }))}
        cats={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: c.type }))}
        projs={projs.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        tgs={tgs.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
      />
    </div>
  );
}
