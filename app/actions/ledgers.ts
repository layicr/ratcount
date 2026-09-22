"use server";

// ratcount · 账本写操作（薄封装）/ Ledger writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/ledgers；此处仅做「守卫 + revalidatePath」，服务端行为零回归。
import { DASHBOARD_PATH, MR } from "@/lib/constants";
import { requireLedgerAccess, requireUser } from "@/lib/scope";
import * as svc from "@/lib/services/ledgers";
import type { LedgerInput } from "@/lib/services/ledgers";
import { revalidatePath } from "next/cache";

export async function createLedger(input: LedgerInput) {
  const user = await requireUser();
  const r = await svc.createLedgerService({ id: user.id, role: user.role }, input);
  if (r.ok) {
    revalidatePath("/ledgers");
    revalidatePath(DASHBOARD_PATH);
  }
  return r;
}

export async function updateLedger(ledgerId: string, input: LedgerInput) {
  const { user } = await requireLedgerAccess(ledgerId, MR.owner);
  const r = await svc.updateLedgerService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) {
    revalidatePath("/ledgers");
    revalidatePath(DASHBOARD_PATH);
  }
  return r;
}

export async function deleteLedger(ledgerId: string) {
  const { user } = await requireLedgerAccess(ledgerId, MR.owner);
  const r = await svc.deleteLedgerService({ id: user.id, role: user.role }, ledgerId);
  if (r.ok) {
    revalidatePath("/ledgers");
    revalidatePath(DASHBOARD_PATH);
  }
  return r;
}
