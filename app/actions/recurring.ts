"use server";

// 薄封装：守卫 + 取账本 + 调 lib/services/recurring + 重新校验缓存（Next 专属，不进服务层）
import { revalidatePath } from "next/cache";
import { getCurrentLedgerId } from "@/lib/ledger";
import { requireLedgerAccess } from "@/lib/scope";
import { revalidateTxRelated } from "@/lib/revalidate";
import { MR } from "@/lib/constants";
import {
  createRecurringPlanService, updateRecurringPlanService, deleteRecurringPlanService,
  toggleRecurringPlanService, runRecurringPlanService, type RecurringPlanInput,
} from "@/lib/services/recurring";

export type { RecurringPlanInput };

/** 新建周期计划 */
export async function createRecurringPlan(input: RecurringPlanInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await createRecurringPlanService({ id: user.id }, ledgerId, input);
  if (res.ok) revalidatePath("/recurring");
  return res;
}

/** 更新周期计划 */
export async function updateRecurringPlan(id: string, input: RecurringPlanInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await updateRecurringPlanService({ id: user.id }, ledgerId, id, input);
  if (res.ok) revalidatePath("/recurring");
  return res;
}

/** 删除周期计划 */
export async function deleteRecurringPlan(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await deleteRecurringPlanService({ id: user.id }, ledgerId, id);
  if (res.ok) revalidatePath("/recurring");
  return res;
}

/** 暂停/恢复周期计划 */
export async function toggleRecurringPlan(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await toggleRecurringPlanService({ id: user.id }, ledgerId, id);
  if (res.ok) revalidatePath("/recurring");
  return res;
}

/** 执行本期 */
export async function runRecurringPlan(id: string, postDate?: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await runRecurringPlanService({ id: user.id }, ledgerId, id, postDate);
  if (res.ok) {
    revalidatePath("/recurring");
    revalidateTxRelated();
  }
  return res;
}
