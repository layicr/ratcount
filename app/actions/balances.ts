"use server";

// ratcount · 余额快照写操作（薄封装）/ Balance snapshot writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/balances；此处仅做「守卫 + 当前账本 + revalidatePath」，服务端行为零回归。
import { MR, BALANCE_PATH } from "@/lib/constants";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import * as svc from "@/lib/services/balances";
import type { BalanceInput } from "@/lib/services/balances";
import { revalidatePath } from "next/cache";

export async function recordBalance(input: BalanceInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await svc.recordBalanceService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) revalidatePath(BALANCE_PATH);
  return r;
}
