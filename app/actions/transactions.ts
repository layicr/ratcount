"use server";

// 薄封装：守卫 + 取账本 + 调 lib/services/transactions + 重新校验缓存（Next 专属，不进服务层）
import { revalidatePath } from "next/cache";
import { getCurrentLedgerId } from "@/lib/ledger";
import { requireLedgerEditor } from "@/lib/scope";
import { getTranslations } from "next-intl/server";
import { DASHBOARD_PATH, TRANSACTIONS_PATH } from "@/lib/constants";
import { revalidateTxRelated } from "@/lib/revalidate";
import { type TransactionInput } from "@/lib/validators";
import {
  createTransactionService, updateTransactionService, copyTransactionService,
  deleteTransactionService, batchDeleteTransactionsService,
} from "@/lib/services/transactions";

export type { TransactionInput };

/** 新增流水 / Create transaction */
export async function createTransaction(input: TransactionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const res = await createTransactionService({ id: user.id }, ledgerId, input);
  if (res.ok) revalidateTxRelated();
  return res;
}

/** 更新流水 / Update transaction */
export async function updateTransaction(id: string, input: TransactionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const res = await updateTransactionService({ id: user.id }, ledgerId, id, input);
  if (res.ok) revalidateTxRelated();
  return res;
}

/** 复制流水 / Duplicate transaction */
export async function copyTransaction(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const t = await getTranslations("tx");
  const res = await copyTransactionService({ id: user.id }, ledgerId, id, t("copied"));
  if (res.ok) {
    revalidatePath(TRANSACTIONS_PATH);
    revalidatePath(DASHBOARD_PATH);
  }
  return res;
}

/** 删除单笔流水 / Delete transaction */
export async function deleteTransaction(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const res = await deleteTransactionService({ id: user.id }, ledgerId, id);
  if (res.ok) revalidateTxRelated();
  return res;
}

/** 批量删除流水 / Batch delete */
export async function batchDeleteTransactions(ids: string[]) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerEditor(ledgerId);
  const res = await batchDeleteTransactionsService({ id: user.id }, ledgerId, ids);
  if (res.ok) revalidateTxRelated();
  return res;
}
