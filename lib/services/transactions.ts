// ratcount · 流水 业务服务 / Transaction business services
//  - 从 app/actions/transactions.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie）。
import { transactionTags, auditLogs, transactions, accounts } from "@/db/schema";
import { AUDIT_ACTION, ENTITY, TX } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit, resolveSummary } from "@/lib/audit";
import { transactionSchema, type TransactionInput } from "@/lib/validators";
import { assertRefsInLedger, RefNotInLedgerError, type Tx } from "@/lib/ledger-refs";
import { yuanToCents } from "@/lib/money";
import { loadCurrencyRates } from "@/lib/currency";
import { resolveTransactionMoney } from "@/lib/tx-currency";
import { and, eq, inArray } from "drizzle-orm";
import { type Actor } from "./guard";

const txSchema = transactionSchema;

/** 内部哨兵：更新 0 行（目标流水不存在/无权限），跳过审计 */
class TransactionNotUpdatedError extends Error {}

/** 复制流水时追加到备注的「副本」标签（服务端会传翻译后的文案，桌面回退到固定串） */
const today = () => new Date().toISOString().slice(0, 10);

/* ===================== 新增 / Create ===================== */

export async function createTransactionService(actor: Actor, ledgerId: string, input: TransactionInput) {
  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  const amountCents = yuanToCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "errors.amountInvalid" };

  if (d.type === TX.transfer) {
    if (!d.toAccountId || d.toAccountId === d.accountId) return { ok: false as const, error: "errors.selectTransfer" };
  } else if (!d.categoryId) {
    return { ok: false as const, error: "common.categoryRequired" };
  }

  const summaryParams = { type: d.type, remark: d.remark ?? "" };
  const rates = await loadCurrencyRates();
  try {
    const reqBody = JSON.stringify({
      type: d.type, accountId: d.accountId, toAccountId: d.toAccountId ?? null,
      categoryId: d.categoryId ?? null, projectId: d.projectId ?? null,
      amountYuan: d.amountYuan, txDate: d.txDate, remark: d.remark ?? null, tagIds: d.tagIds ?? [],
    });
    await withAudit(
      { userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.transaction, summaryKey: "audit.txCreated", summaryParams, requestBody: reqBody, responseBody: '{"result":"created"}' },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId,
          toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null,
          tagIds: d.tagIds ?? [],
        });
        const money = await resolveTransactionMoney(tx, ledgerId, {
          accountId: d.accountId,
          toAccountId: d.type === TX.transfer ? (d.toAccountId ?? null) : null,
          amountCents, type: d.type, rates,
        });
        const [row] = await tx.insert(transactions).values({
          ledgerId, accountId: d.accountId,
          toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          type: d.type, categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null, amountCents, txDate: d.txDate,
          remark: d.remark ?? null, createdBy: actor.id,
          ...money,
        }).returning();
        if (d.tagIds?.length) {
          await tx.insert(transactionTags).values(d.tagIds.map((tagId) => ({ transactionId: row.id, tagId })));
        }
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.saveFailed" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 更新 / Update ===================== */

export async function updateTransactionService(actor: Actor, ledgerId: string, id: string, input: TransactionInput) {
  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  const amountCents = yuanToCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "errors.amountInvalid" };

  if (d.type === TX.transfer) {
    if (!d.toAccountId || d.toAccountId === d.accountId) return { ok: false as const, error: "errors.selectTransfer" };
  } else if (!d.categoryId) {
    return { ok: false as const, error: "common.categoryRequired" };
  }

  const summaryParams = { type: d.type, remark: d.remark ?? null };
  const rates = await loadCurrencyRates();
  try {
    const reqBody = JSON.stringify({
      id, type: d.type, accountId: d.accountId, toAccountId: d.toAccountId ?? null,
      categoryId: d.categoryId ?? null, projectId: d.projectId ?? null,
      amountYuan: d.amountYuan, txDate: d.txDate, remark: d.remark ?? null, tagIds: d.tagIds ?? [],
    });
    await db.transaction(async (tx) => {
      await assertRefsInLedger(tx, ledgerId, {
        accountId: d.accountId,
        toAccountId: d.type === TX.transfer ? d.toAccountId : null,
        categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
        projectId: d.projectId ?? null,
        tagIds: d.tagIds ?? [],
      });
      const money = await resolveTransactionMoney(tx, ledgerId, {
        accountId: d.accountId,
        toAccountId: d.type === TX.transfer ? (d.toAccountId ?? null) : null,
        amountCents, type: d.type, rates,
      });
      const upd = await tx.update(transactions).set({
        accountId: d.accountId,
        toAccountId: d.type === TX.transfer ? d.toAccountId : null,
        type: d.type,
        categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
        projectId: d.projectId ?? null,
        amountCents,
        txDate: d.txDate,
        remark: d.remark ?? null,
        updatedAt: new Date().toISOString(),
        ...money,
      }).where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
      const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;

      await tx.delete(transactionTags).where(eq(transactionTags.transactionId, id));
      if (d.tagIds?.length) {
        await tx.insert(transactionTags).values(d.tagIds.map((tagId) => ({ transactionId: id, tagId })));
      }

      if (rowsAffected === 0) throw new TransactionNotUpdatedError();

      const s = resolveSummary({
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.transaction,
        entityId: id, summaryKey: "audit.txUpdated", summaryParams,
      });
      await tx.insert(auditLogs).values({
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.transaction, entityId: id,
        summary: s.summary, summaryKey: s.summaryKey, summaryParams: s.summaryParams,
        requestBody: reqBody, responseBody: '{"result":"updated"}',
      });
    });
  } catch (e) {
    if (e instanceof TransactionNotUpdatedError) return { ok: false as const, error: "errors.txNotFound" };
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.saveFailed" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 复制 / Duplicate ===================== */

export async function copyTransactionService(actor: Actor, ledgerId: string, id: string, copiedLabel: string) {
  const [src] = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
  if (!src) return { ok: false as const, error: "errors.txNotFound" };

  const srcTags = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, id));
  const newTxId = crypto.randomUUID();

  await withAudit(
    { userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.transaction, summaryKey: "audit.txDuplicated", summaryParams: { remark: src.remark || id }, requestBody: JSON.stringify({ srcId: id, srcRemark: src.remark ?? null, amountCents: src.amountCents, tagCount: srcTags.length, newTxId }), responseBody: '{"result":"duplicated"}' },
    async (tx) => {
      await tx.insert(transactions).values({
        id: newTxId, ledgerId: src.ledgerId, accountId: src.accountId, toAccountId: src.toAccountId,
        type: src.type, categoryId: src.categoryId, projectId: src.projectId,
        amountCents: src.amountCents, txDate: today(),
        remark: src.remark ? `${src.remark}${copiedLabel}` : copiedLabel, createdBy: actor.id,
        currencyCode: src.currencyCode, toCurrencyCode: src.toCurrencyCode,
        usedRateFrom: src.usedRateFrom, usedRateTo: src.usedRateTo,
        toAmountCents: src.toAmountCents, baseAmountCents: src.baseAmountCents,
      });
      if (srcTags.length > 0) {
        await tx.insert(transactionTags).values(srcTags.map((tag) => ({ transactionId: newTxId, tagId: tag.tagId })));
      }
    },
  );
  return { ok: true as const, error: null };
}

/* ===================== 删除 / Delete ===================== */

export async function deleteTransactionService(actor: Actor, ledgerId: string, id: string) {
  const [src] = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
  if (!src) return { ok: false as const, error: "errors.txNotFound" };

  await withAudit(
    { userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.transaction, entityId: id, summaryKey: "audit.txDeleted", summaryParams: { remark: src.remark || id }, requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => {
      await tx.delete(transactionTags).where(inArray(transactionTags.transactionId, [id]));
      await tx.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}

export async function batchDeleteTransactionsService(actor: Actor, ledgerId: string, ids: string[]) {
  if (!ids.length) return { ok: false as const, error: "errors.noneSelected" };

  await withAudit(
    { userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.transaction, summaryKey: "audit.txBatchDeleted", summaryParams: { count: ids.length }, requestBody: JSON.stringify({ count: ids.length, ids }), responseBody: '{"result":"batch-deleted"}' },
    async (tx) => {
      const valid = await tx.select({ id: transactions.id }).from(transactions)
        .where(and(inArray(transactions.id, ids), eq(transactions.ledgerId, ledgerId)));
      const vids = valid.map((v) => v.id);
      if (vids.length) {
        await tx.delete(transactionTags).where(inArray(transactionTags.transactionId, vids));
        await tx.delete(transactions).where(inArray(transactions.id, vids));
      }
    },
  );
  return { ok: true as const, error: null };
}
