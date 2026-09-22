/**
 * ratcount · 账户余额纯计算（无 DB 依赖，可直接单测）
 * 核心口径：账户余额不落库，由期初 + 流水实时汇总
 * ratcount · pure account-balance math (no DB dependency, unit-testable)
 * Core rule: balances are not stored; computed live from opening + transactions
 */
import { TX } from "@/lib/constants";

/** 余额计算所需的最小流水行 / Minimal transaction row for balance math */
export type TxRow = {
  accountId: string | null;
  toAccountId: string | null;
  type: string;
  amountCents: number;
  txDate?: string; // 余额计算不需要，仅趋势/月度统计需要 / unused by balance math; only for trend/monthly stats
};

/** 计算账户余额增量（income+/expense-/transfer 出-入+）/ Compute per-account balance deltas (income+/expense-/transfer out-in+) */
export function computeBalanceDelta(txs: TxRow[]): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (acct: string | null, amt: number) => {
    if (!acct) return;
    delta.set(acct, (delta.get(acct) ?? 0) + amt);
  };
  for (const t of txs) {
    if (t.type === TX.income) add(t.accountId, t.amountCents);
    else if (t.type === TX.expense) add(t.accountId, -t.amountCents);
    else {
      add(t.accountId, -t.amountCents);
      add(t.toAccountId, t.amountCents);
    }
  }
  return delta;
}
