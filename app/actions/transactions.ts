"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, transactionTags } from "@/db/schema";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { transactionSchema, type TransactionInput } from "@/lib/validators";

/** 交易入参 schema（前后端共用，见 lib/validators） */
const txSchema = transactionSchema;

const today = () => new Date().toISOString().slice(0, 10);

/** 新增流水（写操作，带审计） / Create transaction */
export async function createTransaction(input: TransactionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "common.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");

  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "common.invalidInput" };
  const d = parsed.data;

  const amountCents = yuanToCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0)
    return { ok: false as const, error: "errors.amountInvalid" };

  if (d.type === "transfer") {
    if (!d.toAccountId || d.toAccountId === d.accountId)
      return { ok: false as const, error: "errors.selectTransfer" };
  } else if (!d.categoryId) {
    return { ok: false as const, error: "errors.selectCategory" };
  }

  const summary = `${d.type === "income" ? "收入" : d.type === "expense" ? "支出" : "转账"} ${d.remark || "无备注"}`;
  try {
    const reqBody = JSON.stringify({
      type: d.type, accountId: d.accountId, toAccountId: d.toAccountId ?? null,
      categoryId: d.categoryId ?? null, projectId: d.projectId ?? null,
      amountYuan: d.amountYuan, txDate: d.txDate, remark: d.remark ?? null, tagIds: d.tagIds ?? [],
    });
    await withAudit(
      { userId: user.id, action: "C", entity: "transaction", summary, requestBody: reqBody, responseBody: '{"result":"created"}' },
      async (tx) => {
        const [row] = await tx
          .insert(transactions)
          .values({
            ledgerId,
            accountId: d.accountId,
            toAccountId: d.type === "transfer" ? d.toAccountId : null,
            type: d.type,
            categoryId: d.type === "transfer" ? null : (d.categoryId ?? null),
            projectId: d.projectId ?? null,
            amountCents,
            txDate: d.txDate,
            remark: d.remark ?? null,
            createdBy: user.id,
          })
          .returning();
        if (d.tagIds?.length) {
          await tx.insert(transactionTags).values(
            d.tagIds.map((tagId) => ({ transactionId: row.id, tagId })),
          );
        }
      },
    );
  } catch (e) {
    return { ok: false as const, error: "common.saveFailed" };
  }
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

/** 更新流水（写操作，带审计） / Update transaction */
export async function updateTransaction(id: string, input: TransactionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "common.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");

  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "common.invalidInput" };
  const d = parsed.data;

  const amountCents = yuanToCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0)
    return { ok: false as const, error: "errors.amountInvalid" };

  if (d.type === "transfer") {
    if (!d.toAccountId || d.toAccountId === d.accountId)
      return { ok: false as const, error: "errors.selectTransfer" };
  } else if (!d.categoryId) {
    return { ok: false as const, error: "errors.selectCategory" };
  }

  const summary = `更新${d.type === "income" ? "收入" : d.type === "expense" ? "支出" : "转账"} ${d.remark || "无备注"}`;
  try {
    const reqBody = JSON.stringify({
      id, type: d.type, accountId: d.accountId, toAccountId: d.toAccountId ?? null,
      categoryId: d.categoryId ?? null, projectId: d.projectId ?? null,
      amountYuan: d.amountYuan, txDate: d.txDate, remark: d.remark ?? null, tagIds: d.tagIds ?? [],
    });
    await withAudit(
      { userId: user.id, action: "U", entity: "transaction", entityId: id, summary, requestBody: reqBody, responseBody: '{"result":"updated"}' },
      async (tx) => {
        await tx
          .update(transactions)
          .set({
            accountId: d.accountId,
            toAccountId: d.type === "transfer" ? d.toAccountId : null,
            type: d.type,
            categoryId: d.type === "transfer" ? null : (d.categoryId ?? null),
            projectId: d.projectId ?? null,
            amountCents,
            txDate: d.txDate,
            remark: d.remark ?? null,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
        // 更新标签：先删后插
        await tx.delete(transactionTags).where(eq(transactionTags.transactionId, id));
        if (d.tagIds?.length) {
          await tx.insert(transactionTags).values(
            d.tagIds.map((tagId) => ({ transactionId: id, tagId })),
          );
        }
      },
    );
  } catch (e) {
    return { ok: false as const, error: "common.saveFailed" };
  }
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

/** 复制流水（周期账单重复）/ Duplicate a transaction */
export async function copyTransaction(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "common.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");

  // 复制源流水必须属于当前账本（防止跨账本越权读/写）
  const [src] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
  if (!src) return { ok: false as const, error: "common.txNotFound" };

  // 查询源流水的标签 / Query source transaction tags
  const srcTags = await db
    .select()
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, id));

  // 预生成新流水 ID，避免依赖 returning() / Pre-generate new transaction ID
  const newTxId = crypto.randomUUID();

  await withAudit(
    { userId: user.id, action: "C", entity: "transaction", summary: `复制流水 ${src.remark || id}`, requestBody: JSON.stringify({ srcId: id, srcRemark: src.remark ?? null, amountCents: src.amountCents, tagCount: srcTags.length, newTxId }), responseBody: '{"result":"duplicated"}' },
    async (tx) => {
      // 插入新流水（指定预生成的 ID）/ Insert new transaction with pre-generated ID
      await tx.insert(transactions).values({
        id: newTxId,
        ledgerId: src.ledgerId,
        accountId: src.accountId,
        toAccountId: src.toAccountId,
        type: src.type,
        categoryId: src.categoryId,
        projectId: src.projectId,
        amountCents: src.amountCents,
        txDate: today(),
        remark: src.remark ? `${src.remark}（复制）` : "（复制）",
        createdBy: user.id,
      });

      // 复制标签到新流水 / Copy tags to new transaction
      if (srcTags.length > 0) {
        await tx.insert(transactionTags).values(
          srcTags.map((tag) => ({
            transactionId: newTxId,
            tagId: tag.tagId,
          })),
        );
      }
    },
  );
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true as const, error: null };
}

/** 删除单笔流水 / Delete a transaction */
export async function deleteTransaction(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "common.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");
  // 目标流水必须属于当前账本（防止跨账本越权删）
  const [src] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
  if (!src) return { ok: false as const, error: "common.txNotFound" };

  await withAudit(
    { userId: user.id, action: "D", entity: "transaction", entityId: id, summary: `删除流水 ${src.remark || id}`, requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => {
      await tx.delete(transactionTags).where(inArray(transactionTags.transactionId, [id]));
      await tx.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
    },
  );
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

/** 批量删除流水 / Batch delete transactions */
export async function batchDeleteTransactions(ids: string[]) {
  if (!ids.length) return { ok: false as const, error: "common.noneSelected" };
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "common.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");

  await withAudit(
    { userId: user.id, action: "D", entity: "transaction", summary: `批量删除 ${ids.length} 条流水`, requestBody: JSON.stringify({ count: ids.length, ids }), responseBody: '{"result":"batch-deleted"}' },
    async (tx) => {
      // 仅删除属于当前账本的流水（防止跨账本越权批量删）
      const valid = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(inArray(transactions.id, ids), eq(transactions.ledgerId, ledgerId)));
      const vids = valid.map((v) => v.id);
      if (vids.length) {
        await tx.delete(transactionTags).where(inArray(transactionTags.transactionId, vids));
        await tx.delete(transactions).where(inArray(transactions.id, vids));
      }
    },
  );
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

export type TxAction = Awaited<ReturnType<typeof createTransaction>>;
