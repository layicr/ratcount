// ratcount · 账户业务服务 / Account business service
//  - 从 app/actions/accounts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
//  - 只接收 actor/ledgerId，不碰 cookie/redirect/Auth.js；revalidatePath 由调用方负责。
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { accounts, balances, investmentHoldings, recurringPlans, transactions } from "@/db/schema";
import { AUDIT_ACTION, ENTITY } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { loadCurrencyRates, rateOf, toBaseCents } from "@/lib/currency";
import { type Actor } from "./guard";

/** 账户被流水/计划/持仓/快照引用：抛错回滚事务（含审计），由调用方转 i18n 错误码 */
class AccountInUseError extends Error {
  constructor() {
    super("account is referenced");
    this.name = "AccountInUseError";
  }
}

const acctSchema = z.object({
  name: z.string().min(1).max(30),
  type: z.string().min(1),
  icon: z.string().max(4).optional(),
  currencyCode: z.string().min(1),
  openingYuan: z.string().max(20).optional(),
  isAsset: z.boolean().optional(),
  remark: z.string().max(200).optional(),
});
export type AccountInput = z.infer<typeof acctSchema>;

/* ===================== 账户 / Accounts ===================== */

export async function createAccountService(actor: Actor, ledgerId: string, input: AccountInput) {
  const parsed = acctSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const openingCents = d.openingYuan ? yuanToCents(d.openingYuan) : 0;
  if (openingCents === null) return { ok: false as const, error: "errors.openingBalanceInvalid" };
  const rates = await loadCurrencyRates();
  const baseOpeningCents = toBaseCents(openingCents, rateOf(rates, d.currencyCode));

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.account,
      summaryKey: "audit.accountCreated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ name: d.name, type: d.type, icon: d.icon ?? "💳", currencyCode: d.currencyCode, openingYuan: d.openingYuan ?? null, isAsset: d.isAsset ?? true }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(accounts).values({
        ledgerId,
        name: d.name,
        type: d.type as never,
        icon: d.icon ?? "💳",
        currencyCode: d.currencyCode,
        openingBalanceCents: openingCents,
        baseOpeningBalanceCents: baseOpeningCents,
        isAsset: d.isAsset ?? true,
        remark: d.remark ?? null,
        createdBy: actor.id,
      });
    },
  );
  return { ok: true as const, error: null };
}

export async function updateAccountService(actor: Actor, ledgerId: string, id: string, input: AccountInput) {
  const parsed = acctSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const openingCents = d.openingYuan ? yuanToCents(d.openingYuan) : 0;
  if (openingCents === null) return { ok: false as const, error: "errors.openingBalanceInvalid" };
  const rates = await loadCurrencyRates();
  const baseOpeningCents = toBaseCents(openingCents, rateOf(rates, d.currencyCode));

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.account,
      entityId: id,
      summaryKey: "audit.accountUpdated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ id, name: d.name, type: d.type, openingYuan: d.openingYuan ?? null, isAsset: d.isAsset ?? true }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .update(accounts)
        .set({
          name: d.name,
          type: d.type as never,
          icon: d.icon ?? "💳",
          currencyCode: d.currencyCode,
          openingBalanceCents: openingCents,
          baseOpeningBalanceCents: baseOpeningCents,
          isAsset: d.isAsset ?? true,
          remark: d.remark ?? null,
        })
        .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}

/** 删除账户（被引用则拒绝，避免余额/报表/持仓错乱）/ Delete account (reject when referenced) */
export async function deleteAccountService(actor: Actor, ledgerId: string, id: string) {
  try {
    await withAudit(
      {
        userId: actor.id,
        action: AUDIT_ACTION.delete,
        entity: ENTITY.account,
        entityId: id,
        summaryKey: "audit.accountDeleted",
        summaryParams: {},
        requestBody: JSON.stringify({ id }),
        responseBody: '{"result":"deleted"}',
      },
      async (tx) => {
        const [[refTx], [refPlan], [refInv], [refBal]] = await Promise.all([
          tx.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ledgerId, ledgerId), or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)))).limit(1),
          tx.select({ id: recurringPlans.id }).from(recurringPlans).where(and(eq(recurringPlans.ledgerId, ledgerId), or(eq(recurringPlans.accountId, id), eq(recurringPlans.toAccountId, id)))).limit(1),
          tx.select({ id: investmentHoldings.id }).from(investmentHoldings).where(and(eq(investmentHoldings.ledgerId, ledgerId), or(eq(investmentHoldings.accountId, id), eq(investmentHoldings.paymentAccountId, id)))).limit(1),
          tx.select({ id: balances.id }).from(balances).where(and(eq(balances.ledgerId, ledgerId), eq(balances.accountId, id))).limit(1),
        ]);
        if (refTx || refPlan || refInv || refBal) throw new AccountInUseError();
        await tx.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)));
      },
    );
  } catch (e) {
    if (e instanceof AccountInUseError) return { ok: false as const, error: "errors.accountInUse" };
    throw e;
  }
  return { ok: true as const, error: null };
}
