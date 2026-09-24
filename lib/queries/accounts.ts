/**
 * 账户与余额查询 / Account & balance queries
 *  - 余额不落库，由期初 + 流水实时汇总（增量在 SQL 层聚合，聚合后行数 ≪ 流水总数）
 * Account balances are not stored; computed live from opening + transactions (deltas aggregated in SQL, rows ≪ tx count).
 */
import { balances, transactions, accounts } from "@/db/schema"
import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";




import { computeBalanceDelta, computeBaseBalanceDelta } from "@/lib/balance";

/**
 * 账户列表 + 实时余额 / Account list + live balance
 * cache()：同一请求内被首页 / 账户页 / 报表 / 投资页等多处调用时只聚合一次
 * （该查询对账本内全部流水做 GROUP BY，重复调用成本高）
 * cache(): one aggregation per request when reused by dashboard/accounts/reports/investments.
 * (The query GROUP BYs all transactions in the ledger; repeated calls are expensive.)
 */
export const listAccountsWithBalance = cache(async (ledgerId: string) => {
  const accts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ledgerId, ledgerId))
    .orderBy(accounts.sort, accounts.name);
  // 余额增量在 SQL 层按 (账户 × 转入账户 × 类型) 聚合，聚合后行数 ≪ 流水总数 / Balance delta aggregated in SQL by (account × toAccount × type); rows ≪ tx count
  // 同时聚合原币(toAmountCents 回退 amountCents) 与基准币种(baseAmountCents) 两列，分别算原生余额与基准余额
  const grouped = await db
    .select({
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      type: transactions.type,
      sum: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
      toSum: sql<number>`coalesce(sum(coalesce(${transactions.toAmountCents}, ${transactions.amountCents})), 0)`,
      baseSum: sql<number>`coalesce(sum(${transactions.baseAmountCents}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId))
    .groupBy(transactions.accountId, transactions.toAccountId, transactions.type);
  const nativeDelta = computeBalanceDelta(
    grouped.map((r) => ({
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      type: r.type,
      amountCents: Number(r.sum),
      toAmountCents: Number(r.toSum),
    })),
  );
  const baseDelta = computeBaseBalanceDelta(
    grouped.map((r) => ({
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      type: r.type,
      baseAmountCents: Number(r.baseSum),
    })),
  );
  return accts.map((a) => ({
    ...a,
    balanceCents: a.openingBalanceCents + (nativeDelta.get(a.id) ?? 0),
    baseBalanceCents: a.baseOpeningBalanceCents + (baseDelta.get(a.id) ?? 0),
  }));
});

/** 余额快照列表（对账）：每账户最新快照 + 与实时余额的差额 / Balance snapshots (reconciliation): latest snapshot per account + diff vs live balance */
export async function listBalances(ledgerId: string) {
  const accts = await listAccountsWithBalance(ledgerId);
  const snaps = await db
    .select()
    .from(balances)
    .where(eq(balances.ledgerId, ledgerId));
  // 每账户最新快照 / Latest snapshot per account
  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) {
    const cur = latest.get(s.accountId);
    if (!cur || s.snapshotDate > cur.snapshotDate) latest.set(s.accountId, s);
  }
  return accts.map((a) => {
    const snap = latest.get(a.id);
    return {
      ...a,
      snapshot: snap ?? null,
      diff: snap ? a.balanceCents - snap.balanceAmountCents : null,
    };
  });
}
