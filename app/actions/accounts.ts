"use server";

// ratcount · 账户写操作（薄封装）/ Account writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/accounts；此处仅做「守卫 + 当前账本 + revalidatePath」，服务端行为零回归。
import { DASHBOARD_PATH } from "@/lib/constants";
import { requireLedgerEditor } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import * as svc from "@/lib/services/accounts";
import type { AccountInput } from "@/lib/services/accounts";
import { revalidatePath } from "next/cache";

export async function createAccount(input: AccountInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const r = await svc.createAccountService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) {
    revalidatePath("/accounts");
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/balance");
  }
  return r;
}

export async function updateAccount(id: string, input: AccountInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const r = await svc.updateAccountService({ id: user.id, role: user.role }, ledgerId, id, input);
  if (r.ok) {
    revalidatePath("/accounts");
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/balance");
  }
  return r;
}

export async function deleteAccount(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const r = await svc.deleteAccountService({ id: user.id, role: user.role }, ledgerId, id);
  if (r.ok) {
    revalidatePath("/accounts");
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/balance");
  }
  return r;
}
