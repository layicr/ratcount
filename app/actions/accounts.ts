"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts } from "@/db/schema";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";

const acctSchema = z.object({
  name: z.string().min(1).max(30),
  type: z.string().min(1),
  icon: z.string().max(4).optional(),
  currencyCode: z.string().min(1),
  openingYuan: z.string().optional(),
  isAsset: z.boolean().optional(),
  remark: z.string().max(200).optional(),
});

/** 新增账户 / Create account */
export async function createAccount(input: z.infer<typeof acctSchema>) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");
  const parsed = acctSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const openingCents = d.openingYuan ? yuanToCents(d.openingYuan) : 0;
  if (openingCents === null) return { ok: false as const, error: "errors.openingBalanceInvalid" };

  await withAudit(
    { userId: user.id, action: "C", entity: "account", summary: `新增账户 ${d.name}`, requestBody: JSON.stringify({ name: d.name, type: d.type, icon: d.icon ?? "💳", currencyCode: d.currencyCode, openingYuan: d.openingYuan ?? null, isAsset: d.isAsset ?? true }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(accounts).values({
        ledgerId,
        name: d.name,
        type: d.type as never,
        icon: d.icon ?? "💳",
        currencyCode: d.currencyCode,
        openingBalanceCents: openingCents,
        isAsset: d.isAsset ?? true,
        remark: d.remark ?? null,
        createdBy: user.id,
      });
    },
  );
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

/** 更新账户 / Update account */
export async function updateAccount(id: string, input: z.infer<typeof acctSchema>) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");
  const parsed = acctSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const openingCents = d.openingYuan ? yuanToCents(d.openingYuan) : 0;
  if (openingCents === null) return { ok: false as const, error: "errors.openingBalanceInvalid" };

  await withAudit(
    { userId: user.id, action: "U", entity: "account", entityId: id, summary: `修改账户 ${d.name}`, requestBody: JSON.stringify({ id, name: d.name, type: d.type, openingYuan: d.openingYuan ?? null, isAsset: d.isAsset ?? true }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(accounts).set({
        name: d.name,
        type: d.type as never,
        icon: d.icon ?? "💳",
        currencyCode: d.currencyCode,
        openingBalanceCents: openingCents,
        isAsset: d.isAsset ?? true,
        remark: d.remark ?? null,
      }).where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)));
    },
  );
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}

/** 删除账户 / Delete account */
export async function deleteAccount(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user, member } = await requireLedgerAccess(ledgerId, "editor");
  await withAudit(
    { userId: user.id, action: "D", entity: "account", entityId: id, summary: "删除账户", requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId))); },
  );
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/balance");
  return { ok: true as const, error: null };
}
