/**
 * 流水币种字段解析（写入期）：根据来源/目标账户的币种与汇率快照，算出 currencyCode / usedRate* / toAmountCents / baseAmountCents
 *  - 在事务内调用（tx 为 drizzle 事务句柄），仅读取 accounts 取币种，不写库
 *  - 跨币种转账：toAmountCents = 按汇率折算到目标账户原币；baseAmountCents = 按来源币种汇率折算到基准币种（双方经济价值一致）
 * Resolve transaction currency fields at write time: snapshot currencyCode / usedRate* / toAmountCents / baseAmountCents
 *  - Called inside a transaction (tx = drizzle tx handle); only reads accounts for currency, writes nothing.
 *  - Cross-currency transfer: toAmountCents = converted to target native; baseAmountCents = converted to base via source rate (equal economic value both sides).
 */
import { accounts } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { TX, DEFAULT_CURRENCY } from "@/lib/constants";
import { rateOf, toBaseCents, convertTo, type RateMap } from "@/lib/currency";
import type { Tx } from "@/lib/ledger-refs";

export type TxMoneyFields = {
  currencyCode: string;
  toCurrencyCode: string | null;
  usedRateFrom: string;
  usedRateTo: string | null;
  toAmountCents: number | null;
  baseAmountCents: number;
};

/** 解析单笔流水的币种字段。ledgerId 仅用于潜在隔离扩展，实际按 id 取账户币种 / Resolve one tx's currency fields. */
export async function resolveTransactionMoney(
  tx: Tx,
  _ledgerId: string,
  opts: { accountId: string; toAccountId: string | null; amountCents: number; type: string; rates: RateMap },
): Promise<TxMoneyFields> {
  const ids = opts.toAccountId ? [opts.accountId, opts.toAccountId] : [opts.accountId];
  const accts = await tx
    .select({ id: accounts.id, currencyCode: accounts.currencyCode })
    .from(accounts)
    .where(inArray(accounts.id, ids));
  const curOf = (id: string) => accts.find((a) => a.id === id)?.currencyCode ?? DEFAULT_CURRENCY;
  const fromCur = curOf(opts.accountId);
  const toCur = opts.toAccountId ? curOf(opts.toAccountId) : fromCur;
  const fromRate = rateOf(opts.rates, fromCur);
  const toRate = rateOf(opts.rates, toCur);
  const baseAmountCents = toBaseCents(opts.amountCents, fromRate);
  const isTransfer = opts.type === TX.transfer && !!opts.toAccountId;
  const toAmountCents = isTransfer ? convertTo(opts.amountCents, fromRate, toRate) : null;
  return {
    currencyCode: fromCur,
    toCurrencyCode: opts.toAccountId ? toCur : null,
    usedRateFrom: fromRate,
    usedRateTo: isTransfer ? toRate : null,
    toAmountCents,
    baseAmountCents,
  };
}
