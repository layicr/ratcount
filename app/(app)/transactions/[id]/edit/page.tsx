import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { transactions, accounts, categories, projects, tags, transactionTags } from "@/db/schema";
import { AddForm } from "@/app/(app)/add/add-form";

/** 编辑流水页面：加载交易详情，复用 AddForm 组件 */
export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  const { id } = await params;
  if (!ledger) redirect("/login");

  // 查询交易详情
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledger.id)))
    .limit(1);
  if (!tx) redirect("/transactions");

  // 查询交易标签
  const txTags = await db.select({ tagId: transactionTags.tagId }).from(transactionTags).where(eq(transactionTags.transactionId, id));
  const tagIds = txTags.map((t) => t.tagId);

  // 查询账户、分类、项目、标签列表
  const [accts, cats, projs, tgs] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
    db.select().from(projects).where(eq(projects.ledgerId, ledger.id)),
    db.select().from(tags).where(eq(tags.ledgerId, ledger.id)),
  ]);

  const initialTx = {
    id: tx.id,
    type: tx.type as "expense" | "income" | "transfer",
    amountYuan: (tx.amountCents / 100).toFixed(2),
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? undefined,
    categoryId: tx.categoryId ?? undefined,
    projectId: tx.projectId ?? undefined,
    tagIds,
    txDate: tx.txDate,
    remark: tx.remark ?? "",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.add.editTitle}</h1>
      <AddForm
        accts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, balanceCents: a.openingBalanceCents }))}
        cats={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: c.type }))}
        projs={projs.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        tgs={tgs.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        initialTx={initialTx}
        isEdit={true}
      />
    </div>
  );
}
