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
  amountCents?: number; // 原生金额（分）；基准聚合时可缺省 / native amount; optional for base-only aggregation
  toAmountCents?: number | null; // 转账目标账户入账金额（原币）；缺省回退 amountCents（同币种转账）/ transfer credit in target native; fallback amountCents (same-currency)
  baseAmountCents?: number; // 折算基准币种金额（分）/ amount in base currency
  txDate?: string; // 余额计算不需要，仅趋势/月度统计需要 / unused by balance math; only for trend/monthly stats
};

/** 计算账户余额增量（原币，income+/expense-/transfer 出-入+；跨币种转账入账用 toAmountCents）/ Compute per-account native balance deltas */
export function computeBalanceDelta(txs: TxRow[]): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (acct: string | null, amt: number) => {
    if (!acct) return;
    delta.set(acct, (delta.get(acct) ?? 0) + amt);
  };
  for (const t of txs) {
    const amt = t.amountCents ?? 0;
    if (t.type === TX.income) add(t.accountId, amt);
    else if (t.type === TX.expense) add(t.accountId, -amt);
    else {
      add(t.accountId, -amt);
      add(t.toAccountId, t.toAmountCents ?? amt);
    }
  }
  return delta;
}

/** 计算账户余额增量（基准币种，口径同 computeBalanceDelta，但用 baseAmountCents）/ Compute per-account base-currency balance deltas */
export function computeBaseBalanceDelta(txs: TxRow[]): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (acct: string | null, amt: number) => {
    if (!acct) return;
    delta.set(acct, (delta.get(acct) ?? 0) + amt);
  };
  for (const t of txs) {
    const b = t.baseAmountCents ?? 0;
    if (t.type === TX.income) add(t.accountId, b);
    else if (t.type === TX.expense) add(t.accountId, -b);
    else {
      add(t.accountId, -b);
      add(t.toAccountId, b);
    }
  }
  return delta;
}
