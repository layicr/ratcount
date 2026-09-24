/**
 * 币种与汇率辅助：加载汇率表 + 取汇率 + 折算封装
 *  - 汇率以文本存储（DECIMAL 风格），折算走 lib/money 的整数定点 convertCents，避免浮点误差
 *  - 多币种口径：每笔金额按所属账户「原币」存储，并快照 usedRate 预存 base*（基准币种分），历史不可变
 * Currency & rate helpers: load rate table, look up rate, conversion wrappers.
 *  - Rates stored as text; conversion uses integer-fixed-point convertCents (no float drift).
 *  - Multi-currency rule: each amount is stored in its account's native currency, with a snapshotted usedRate precomputing base* (base-currency cents); immutable.
 */
import { db } from "@/lib/db";
import { currencies } from "@/db/schema";
import { convertCents } from "@/lib/money";

/** code → rate 文本映射 / code → rate(text) map */
export type RateMap = Map<string, string>;

/** 加载全局币种汇率表（currencies 为全局表，无 ledgerId 隔离）/ Load global currency rate table (currencies is global) */
export async function loadCurrencyRates(): Promise<RateMap> {
  const rows = await db
    .select({ code: currencies.code, rate: currencies.rate })
    .from(currencies);
  return new Map(rows.map((r) => [r.code, r.rate]));
}

/** 取某币种相对基准的汇率（缺失回退 1，即基准币种本身）/ Rate of a currency vs base (fallback 1 = base currency itself) */
export function rateOf(map: RateMap, code: string): string {
  return map.get(code) ?? "1";
}

/** 原币金额 → 基准币种分（写入时快照，历史不可变）/ native amount → base-currency cents (snapshot at write, immutable) */
export function toBaseCents(amountCents: number, nativeRate: string): number {
  return convertCents(amountCents, nativeRate, "1");
}

/** 原币(from)金额 → 目标币种(to)金额（跨币种转账目标账户入账用）/ native(from) → native(to) for transfer credit */
export function convertTo(amountCents: number, fromRate: string, toRate: string): number {
  return convertCents(amountCents, fromRate, toRate);
}
