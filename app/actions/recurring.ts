"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { recurringPlans, transactions } from "@/db/schema";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { nextRecurringDate } from "@/lib/recurring";

const planSchema = z.object({
  name: z.string().min(1).max(40),
  type: z.enum(["income", "expense", "transfer"]),
  amountYuan: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
});

/** 新建周期计划 / Create a recurring plan */
export async function createRecurringPlan(input: z.infer<typeof planSchema>) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const cents = yuanToCents(d.amountYuan);
  if (cents === null || cents <= 0) return { ok: false as const, error: "errors.amountInvalid" };
  if (d.type === "transfer" && (!d.toAccountId || d.toAccountId === d.accountId))
    return { ok: false as const, error: "errors.selectTransfer" };

  await withAudit(
    { userId: user.id, action: "C", entity: "recurring_plan", summary: `新增周期计划 ${d.name}`, requestBody: JSON.stringify({ name: d.name, type: d.type, amountYuan: d.amountYuan, frequency: d.frequency, dayOfMonth: d.dayOfMonth ?? null, dayOfWeek: d.dayOfWeek ?? null, nextDate: d.nextDate, accountId: d.accountId, categoryId: d.categoryId ?? null }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(recurringPlans).values({
        ledgerId,
        name: d.name.trim(),
        type: d.type,
        amountCents: cents,
        frequency: d.frequency,
        dayOfMonth: d.dayOfMonth ?? null,
        dayOfWeek: d.dayOfWeek ?? null,
        accountId: d.accountId,
        toAccountId: d.type === "transfer" ? d.toAccountId : null,
        categoryId: d.type === "transfer" ? null : (d.categoryId ?? null),
        projectId: d.projectId ?? null,
        nextDate: d.nextDate,
        status: "active",
        remark: d.remark ?? null,
        createdBy: user.id,
      });
    },
  );
  revalidatePath("/recurring");
  return { ok: true as const, error: null };
}

/** 删除周期计划 / Delete a recurring plan */
export async function deleteRecurringPlan(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  await withAudit(
    { userId: user.id, action: "D", entity: "recurring_plan", entityId: id, summary: "删除周期计划", requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(recurringPlans).where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId))); },
  );
  revalidatePath("/recurring");
  return { ok: true as const, error: null };
}

/** 暂停/恢复周期计划 / Pause or resume a recurring plan */
export async function toggleRecurringPlan(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  const [p] = await db
    .select({ id: recurringPlans.id, status: recurringPlans.status, name: recurringPlans.name })
    .from(recurringPlans)
    .where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
  if (!p) return { ok: false as const, error: "errors.planNotFound" };
  const next = p.status === "active" ? "paused" : "active";
  await withAudit(
    { userId: user.id, action: "U", entity: "recurring_plan", entityId: id, summary: `${next === "active" ? "恢复" : "暂停"}周期计划 ${p.name}`, requestBody: JSON.stringify({ id, nextStatus: next }), responseBody: '{"result":"toggled"}' },
    async (tx) => { await tx.update(recurringPlans).set({ status: next }).where(eq(recurringPlans.id, id)); },
  );
  revalidatePath("/recurring");
  return { ok: true as const, error: null };
}

/** 执行本期：按 nextDate 生成一条流水，并把 nextDate 推进到下一期 */
export async function runRecurringPlan(id: string, postDate?: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  const [p] = await db
    .select()
    .from(recurringPlans)
    .where(and(eq(recurringPlans.id, id), eq(recurringPlans.ledgerId, ledgerId)));
  if (!p) return { ok: false as const, error: "errors.planNotFound" };
  if (p.status !== "active") return { ok: false as const, error: "errors.planPaused" };

  const txDate = postDate ?? p.nextDate;
  const nextDate = nextRecurringDate(p.frequency, p.nextDate, {
    dayOfMonth: p.dayOfMonth,
    dayOfWeek: p.dayOfWeek,
  });

  await withAudit(
    { userId: user.id, action: "C", entity: "transaction", summary: `周期计划「${p.name}」生成流水`, requestBody: JSON.stringify({ planId: id, planName: p.name, amountCents: p.amountCents, txDate, nextDate }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(transactions).values({
        ledgerId,
        accountId: p.accountId,
        toAccountId: p.toAccountId,
        type: p.type,
        categoryId: p.categoryId,
        projectId: p.projectId,
        amountCents: p.amountCents,
        txDate,
        remark: p.remark ? `${p.remark}（${p.name}）` : p.name,
        createdBy: user.id,
      });
      await tx.update(recurringPlans).set({ nextDate }).where(eq(recurringPlans.id, id));
    },
  );
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}
