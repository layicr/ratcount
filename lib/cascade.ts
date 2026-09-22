/**
 * 账本级联删除（统一实现）
 * 删除账本及其全部 ledgerId 维度子数据；供 deleteLedger 与 deleteUser 共用，
 * 避免两份清单漂移（此前 ledgers.ts 漏删 investment_holdings / user_menu_config）。
 *
 * 注意：user_profiles / settings / audit_logs 是 userId 维度，不在此处处理
 * （由 deleteUser 按 userId 单独清理）。
 * Ledger cascade delete (single shared implementation)
 * Deletes a ledger and all of its ledgerId-scoped child data; shared by deleteLedger and deleteUser,
 * so the two lists cannot drift apart (ledgers.ts once forgot investment_holdings / user_menu_config).
 *
 * Note: user_profiles / settings / audit_logs are userId-scoped and handled elsewhere
 * (deleteUser cleans them up by userId).
 */
import { transactionTags, recurringPlans, balances, projects, tags, categories, accounts, investmentHoldings, holdingTags, userMenuConfig, ledgerMembers, ledgers, transactions } from "@/db/schema"
import { eq, inArray } from "drizzle-orm";



import { type Tx } from "@/lib/ledger-refs";

/** 级联删除指定账本及其全部 ledgerId 维度子数据（在事务回调 tx 中调用）/ Cascade-delete a ledger and all its ledgerId-scoped child data (call inside a tx callback) */
export async function cascadeDeleteLedger(tx: Tx, ledgerId: string): Promise<void> {
  // transaction_tags 无 ledgerId，需通过 transactionId 子查询删除 / transaction_tags has no ledgerId; delete via a transactionId subquery
  const txIds = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
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
  // holding_tags 无 ledgerId，需通过 holdingId 子查询删除，且必须在删除持仓之前 / holding_tags has no ledgerId; delete via a holdingId subquery, and only before deleting holdings
  const holdingIds = await tx
    .select({ id: investmentHoldings.id })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.ledgerId, ledgerId));
  if (holdingIds.length > 0) {
    await tx.delete(holdingTags).where(inArray(holdingTags.holdingId, holdingIds.map((h) => h.id)));
  }
  await tx.delete(investmentHoldings).where(eq(investmentHoldings.ledgerId, ledgerId));
  await tx.delete(userMenuConfig).where(eq(userMenuConfig.ledgerId, ledgerId));
  await tx.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));
  await tx.delete(ledgers).where(eq(ledgers.id, ledgerId));
}
