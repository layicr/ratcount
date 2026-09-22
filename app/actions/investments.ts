"use server";

// 薄封装：守卫 + 取账本 + 调 lib/services/investments + 重新校验缓存（Next 专属，不进服务层）
import { revalidatePath } from "next/cache";
import { getCurrentLedgerId } from "@/lib/ledger";
import { requireLedgerAccess } from "@/lib/scope";
import { investmentListHref } from "@/lib/investment-types";
import { MR, DASHBOARD_PATH } from "@/lib/constants";
import {
  createInvestmentService, updateInvestmentService, sellInvestmentService,
  dividendInvestmentService, deleteInvestmentService,
  type InvestmentInput, type InvestActionInput,
} from "@/lib/services/investments";

export type { InvestmentInput, InvestActionInput };

/** 新增投资持仓 / Create investment holding */
export async function createInvestment(input: InvestmentInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await createInvestmentService({ id: user.id }, ledgerId, input);
  if (res.ok) {
    revalidatePath("/investments");
    revalidatePath(investmentListHref(input.type as never));
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/transactions");
  }
  return res;
}

/** 更新投资持仓 / Update investment holding */
export async function updateInvestment(id: string, input: InvestmentInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await updateInvestmentService({ id: user.id }, ledgerId, id, input);
  if (res.ok) {
    revalidatePath("/investments");
    revalidatePath(investmentListHref(input.type as never));
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/transactions");
  }
  return res;
}

/** 卖出 / 到期 / Sell or mature */
export async function sellInvestment(input: InvestActionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await sellInvestmentService({ id: user.id }, ledgerId, input);
  if (res.ok) {
    revalidatePath("/investments");
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/transactions");
  }
  return res;
}

/** 派息 / Dividend */
export async function dividendInvestment(input: InvestActionInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await dividendInvestmentService({ id: user.id }, ledgerId, input);
  if (res.ok) {
    revalidatePath("/investments");
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/transactions");
  }
  return res;
}

/** 删除投资持仓（软删除）/ Soft-delete investment holding */
export async function deleteInvestment(id: string, type: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const res = await deleteInvestmentService({ id: user.id }, ledgerId, id, type);
  if (res.ok) {
    revalidatePath("/investments");
    revalidatePath(investmentListHref(type as never));
    revalidatePath(DASHBOARD_PATH);
    revalidatePath("/transactions");
  }
  return res;
}
