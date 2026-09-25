"use server";

// 薄封装：守卫 + 取账本 + 调 lib/services/investments + 重新校验缓存（Next 专属，不进服务层）
import { getTranslations } from "next-intl/server";
import { getCurrentLedgerId } from "@/lib/ledger";
import { requireLedgerAccess } from "@/lib/scope";
import { MR, type InvestmentType } from "@/lib/constants";
import { revalidateInvestmentRelated } from "@/lib/revalidate";
import {
  createInvestmentService, updateInvestmentService, sellInvestmentService,
  dividendInvestmentService, deleteInvestmentService, copyInvestmentService,
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
    revalidateInvestmentRelated(input.type);
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
    revalidateInvestmentRelated(input.type);
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
    revalidateInvestmentRelated();
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
    revalidateInvestmentRelated();
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
    revalidateInvestmentRelated(type as InvestmentType);
  }
  return res;
}

/** 复制投资持仓 / Duplicate investment holding */
export async function copyInvestment(id: string, type: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const t = await getTranslations("investment");
  const res = await copyInvestmentService({ id: user.id }, ledgerId, id, t("copied"));
  if (res.ok) {
    revalidateInvestmentRelated(type as InvestmentType);
  }
  return res;
}
