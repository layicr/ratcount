"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ledgers, ledgerMembers, accounts, categories, tags, projects,
  transactions, transactionTags, balances, recurringPlans,
} from "@/db/schema";
import { requireUser, requireLedgerAccess } from "@/lib/scope";
import { withAudit } from "@/lib/audit";

const ledgerSchema = z.object({
  name: z.string().min(1).max(30),
  icon: z.string().max(4).optional(),
  baseCurrencyCode: z.string().min(1).max(8).optional(),
  remark: z.string().max(200).optional(),
});

/** 新增账本（创建者自动成为 owner）/ Create ledger, creator becomes owner */
export async function createLedger(input: z.infer<typeof ledgerSchema>) {
  const user = await requireUser();
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  let ledgerId = "";
  await withAudit(
    { userId: user.id, action: "C", entity: "ledger", summary: `新增账本 ${d.name}`, requestBody: JSON.stringify({ name: d.name, icon: d.icon ?? "📒", baseCurrencyCode: d.baseCurrencyCode ?? "CNY" }), responseBody: '{"result":"created"}' },
    async (tx) => {
      const [ledger] = await tx.insert(ledgers).values({
        name: d.name,
        icon: d.icon ?? "📒",
        baseCurrencyCode: d.baseCurrencyCode ?? "CNY",
        remark: d.remark ?? null,
        createdBy: user.id,
      }).returning();
      ledgerId = ledger.id;
      // 创建者自动成为 owner / Creator auto becomes owner
      await tx.insert(ledgerMembers).values({
        ledgerId: ledger.id,
        userId: user.id,
        role: "owner",
      });
    },
  );
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
  return { ok: true as const, id: ledgerId };
}

/** 更新账本（仅 owner）/ Update ledger (owner only) */
export async function updateLedger(ledgerId: string, input: z.infer<typeof ledgerSchema>) {
  const { user } = await requireLedgerAccess(ledgerId, "owner");
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  await withAudit(
    { userId: user.id, action: "U", entity: "ledger", entityId: ledgerId, summary: `更新账本 ${d.name}`, requestBody: JSON.stringify({ name: d.name, icon: d.icon ?? "📒", baseCurrencyCode: d.baseCurrencyCode ?? "CNY", remark: d.remark ?? null }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(ledgers).set({
        name: d.name,
        icon: d.icon ?? "📒",
        baseCurrencyCode: d.baseCurrencyCode ?? "CNY",
        remark: d.remark ?? null,
      }).where(eq(ledgers.id, ledgerId));
    },
  );
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** 删除账本（仅 owner），级联删除该账本下所有数据 / Delete ledger (owner only), cascade delete all data */
export async function deleteLedger(ledgerId: string) {
  const { user } = await requireLedgerAccess(ledgerId, "owner");

  await withAudit(
    { userId: user.id, action: "D", entity: "ledger", entityId: ledgerId, summary: "删除账本及全部数据", requestBody: JSON.stringify({ ledgerId }), responseBody: '{"result":"deleted"}' },
    async (tx) => {
      // 按依赖顺序级联删除 / Cascade delete in dependency order
      // transaction_tags 无 ledgerId，需通过 transactionId 子查询删除
      const txIds = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, ledgerId));
      if (txIds.length > 0) {
        await tx.delete(transactionTags).where(inArray(transactionTags.transactionId, txIds.map((t) => t.id)));
      }
      await tx.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
      await tx.delete(recurringPlans).where(eq(recurringPlans.ledgerId, ledgerId));
      await tx.delete(balances).where(eq(balances.ledgerId, ledgerId));
      await tx.delete(projects).where(eq(projects.ledgerId, ledgerId));
      await tx.delete(tags).where(eq(tags.ledgerId, ledgerId));
      await tx.delete(categories).where(eq(categories.ledgerId, ledgerId));
      await tx.delete(accounts).where(eq(accounts.ledgerId, ledgerId));
      await tx.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));
      await tx.delete(ledgers).where(eq(ledgers.id, ledgerId));
    },
  );
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
