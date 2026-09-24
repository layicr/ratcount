// ratcount · 周期计划 业务服务 / Recurring plan business services
//  - 从 app/actions/recurring.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie）。
import { transactions, recurringPlans } from "@/db/schema";
import { MR, recurringFrequencies, AUDIT_ACTION, ENTITY, RECURRING_STATUS, TX } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { loadCurrencyRates } from "@/lib/currency";
import { resolveTransactionMoney } from "@/lib/tx-currency";
import { nextRecurringDate } from "@/lib/recurring";
import { assertRefsInLedger, RefNotInLedgerError } from "@/lib/ledger-refs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Actor } from "./guard";

/** 周期计划 nextDate 被并发抢先推进，整体回滚 */
class PlanConcurrentError extends Error {
  constructor() { super("recurring plan nextDate changed concurrently"); this.name = "PlanConcurrentError"; }
}

const planSchema = z.object({
  name: z.string().min(1).max(40),
  type: z.enum([TX.income, TX.expense, TX.transfer] as const),
  amountYuan: z.string().min(1),
  frequency: z.enum(recurringFrequencies),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
});

export type RecurringPlanInput = z.infer<typeof planSchema>;

/* ===================== 新增 / Create ===================== */

export async function createRecurringPlanService(actor: Actor, ledgerId: string, input: RecurringPlanInput) {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const cents = yuanToCents(d.amountYuan);
  if (cents === null || cents <= 0) return { ok: false as const, error: "errors.amountInvalid" };
  if (d.type === TX.transfer && (!d.toAccountId || d.toAccountId === d.accountId))
    return { ok: false as const, error: "errors.selectTransfer" };

  try {
    await withAudit(
      { userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.recurringPlan, summaryKey: "audit.recurringCreated", summaryParams: { name: d.name }, requestBody: JSON.stringify({ name: d.name, type: d.type, amountYuan: d.amountYuan, frequency: d.frequency, dayOfMonth: d.dayOfMonth ?? null, dayOfWeek: d.dayOfWeek ?? null, nextDate: d.nextDate, accountId: d.accountId, categoryId: d.categoryId ?? null }), responseBody: '{"result":"created"}' },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId,
          toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null,
        });
        await tx.insert(recurringPlans).values({
          ledgerId, name: d.name.trim(), type: d.type, amountCents: cents,
          frequency: d.frequency, dayOfMonth: d.dayOfMonth ?? null, dayOfWeek: d.dayOfWeek ?? null,
          accountId: d.accountId, toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null, nextDate: d.nextDate, status: RECURRING_STATUS.active,
          remark: d.remark ?? null, createdBy: actor.id,
        });
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.saveFailed" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 更新 / Update ===================== */

export async function updateRecurringPlanService(actor: Actor, ledgerId: string, id: string, input: RecurringPlanInput) {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const cents = yuanToCents(d.amountYuan);
  if (cents === null || cents <= 0) return { ok: false as const, error: "errors.amountInvalid" };
  if (d.type === TX.transfer && (!d.toAccountId || d.toAccountId === d.accountId))
    return { ok: false as const, error: "errors.selectTransfer" };

  try {
    await withAudit(
      { userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.recurringPlan, entityId: id, summaryKey: "audit.recurringUpdated", summaryParams: { name: d.name }, requestBody: JSON.stringify({ id, name: d.name, type: d.type, amountYuan: d.amountYuan, frequency: d.frequency, dayOfMonth: d.dayOfMonth ?? null, dayOfWeek: d.dayOfWeek ?? null, nextDate: d.nextDate, accountId: d.accountId, categoryId: d.categoryId ?? null }), responseBody: '{"result":"updated"}' },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId,
          toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null,
        });
        await tx.update(recurringPlans).set({
          name: d.name.trim(), type: d.type, amountCents: cents,
          frequency: d.frequency, dayOfMonth: d.dayOfMonth ?? null, dayOfWeek: d.dayOfWeek ?? null,
          accountId: d.accountId, toAccountId: d.type === TX.transfer ? d.toAccountId : null,
          categoryId: d.type === TX.transfer ? null : (d.categoryId ?? null),
          projectId: d.projectId ?? null, nextDate: d.nextDate, remark: d.remark ?? null,
        }).where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.saveFailed" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 删除 / Delete ===================== */

export async function deleteRecurringPlanService(actor: Actor, ledgerId: string, id: string) {
  await withAudit(
    { userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.recurringPlan, entityId: id, summaryKey: "audit.recurringDeleted", summaryParams: {}, requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(recurringPlans).where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId))); },
  );
  return { ok: true as const, error: null };
}

/* ===================== 暂停/恢复 / Toggle ===================== */

export async function toggleRecurringPlanService(actor: Actor, ledgerId: string, id: string) {
  const [p] = await db.select({ id: recurringPlans.id, status: recurringPlans.status, name: recurringPlans.name })
    .from(recurringPlans).where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
  if (!p) return { ok: false as const, error: "errors.planNotFound" };
  const next = p.status === RECURRING_STATUS.active ? RECURRING_STATUS.paused : RECURRING_STATUS.active;
  await withAudit(
    { userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.recurringPlan, entityId: id, summaryKey: next === RECURRING_STATUS.active ? "audit.recurringResumed" : "audit.recurringPaused", summaryParams: { name: p.name }, requestBody: JSON.stringify({ id, nextStatus: next }), responseBody: '{"result":"toggled"}' },
    async (tx) => {
      await tx.update(recurringPlans).set({ status: next })
        .where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}

/* ===================== 执行本期 / Run ===================== */

export async function runRecurringPlanService(actor: Actor, ledgerId: string, id: string, postDate?: string) {
  const [p] = await db.select().from(recurringPlans)
    .where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
  if (!p) return { ok: false as const, error: "errors.planNotFound" };
  if (p.status !== RECURRING_STATUS.active) return { ok: false as const, error: "errors.planPaused" };

  if (postDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(postDate)) {
    return { ok: false as const, error: "errors.invalidDate" };
  }
  const txDate = postDate ?? p.nextDate;
  const nextDate = nextRecurringDate(p.frequency, p.nextDate, { dayOfMonth: p.dayOfMonth, dayOfWeek: p.dayOfWeek });

  try {
    await withAudit(
      { userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.transaction, summaryKey: "audit.recurringGenerated", summaryParams: { name: p.name }, requestBody: JSON.stringify({ planId: id, planName: p.name, amountCents: p.amountCents, txDate, nextDate }), responseBody: '{"result":"created"}' },
      async (tx) => {
        const rates = await loadCurrencyRates();
        const txMoney = await resolveTransactionMoney(tx, ledgerId, {
          accountId: p.accountId, toAccountId: p.toAccountId, amountCents: p.amountCents, type: p.type, rates,
        });
        await tx.insert(transactions).values({
          ledgerId, accountId: p.accountId, toAccountId: p.toAccountId, type: p.type,
          categoryId: p.categoryId, projectId: p.projectId, amountCents: p.amountCents,
          txDate, remark: p.remark ? `${p.remark}（${p.name}）` : p.name, createdBy: actor.id,
          ...txMoney,
        });
        const upd = await tx.update(recurringPlans).set({ nextDate })
          .where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId), eq(recurringPlans.nextDate, p.nextDate)));
        const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;
        if (rowsAffected === 0) throw new PlanConcurrentError();
      },
    );
  } catch (e) {
    if (e instanceof PlanConcurrentError) return { ok: false as const, error: "errors.saveFailed" };
    return { ok: false as const, error: "errors.saveFailed" };
  }
  return { ok: true as const, error: null };
}
