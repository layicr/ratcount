import { categories, projects, tags, transactionTags, transactions } from "@/db/schema"
import { requireUser } from "@/lib/scope"
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";
import { TRANSACTIONS_PATH } from "@/lib/constants";
import { listAccountsWithBalance } from "@/lib/queries";




import { AddForm } from "@/app/(app)/add/add-form";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 编辑流水页面：加载交易详情，复用 AddForm 组件 */
export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;
  const { id } = await params;

  // 查询交易详情
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledger.id)))
    .limit(1);
  if (!tx) redirect(TRANSACTIONS_PATH);

  // 查询交易标签
  const txTags = await db.select({ tagId: transactionTags.tagId }).from(transactionTags).where(eq(transactionTags.transactionId, id));
  const tagIds = txTags.map((t) => t.tagId);

  // 查询账户、分类、项目、标签列表
  const [accts, cats, projs, tgs] = await Promise.all([
    listAccountsWithBalance(ledger.id),
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
        accts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, type: a.type, balanceCents: a.balanceCents }))}
        cats={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: c.type }))}
        projs={projs.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        tgs={tgs.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        initialTx={initialTx}
        isEdit={true}
      />
    </div>
  );
}
