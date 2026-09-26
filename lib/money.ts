/**
 * 金额工具：一切运算在整数"分"层进行，避免浮点误差
 *  - 前端只做展示（formatCents），不做加减乘除
 *  - 入参校验统一走 yuanToCents
 * Money utilities: all arithmetic stays in integer cents to avoid float errors
 *  - The front-end only formats (formatCents); no add/sub/mul/div there
 *  - Input validation is centralized in yuanToCents
 */

import { DEFAULT_CURRENCY, DEFAULT_LANGUAGE } from "@/lib/constants";

/** 金额单位：分 / Amount unit: cents */
export type Cents = number;

/** 分 → 元字符串（千分位 + 两位小数），支持 locale（默认 DEFAULT_LANGUAGE）/ Cents → yuan string (thousands separators + 2 decimals), locale-aware (default DEFAULT_LANGUAGE) */
export function formatCents(cents: Cents, locale: string = DEFAULT_LANGUAGE): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const s = `${yuan.toLocaleString(locale)}.${String(fen).padStart(2, "0")}`;
  return (negative ? "-" : "") + s;
}

/** 分 → 本地化货币字符串（如 ¥1,234.56 / $1,234.56 / 1.234,56 €）/ Cents → localized currency string (e.g. ¥1,234.56 / $1,234.56 / 1.234,56 €) */
export function formatCurrency(
  cents: Cents,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LANGUAGE,
): string {
  const yuan = Number(cents) / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(yuan);
}

/** 百分比（0.258 → 25.8%），支持 locale / Percent (0.258 → 25.8%), locale-aware */
export function formatPercent(ratio: number, locale: string = DEFAULT_LANGUAGE): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
}

/**
 * 单笔金额上限（分）：10 亿元
 *  - 超出即判非法：SQLite INTEGER 溢出会退化为 REAL，SUM 聚合出 Inf/NaN，导致余额/净资产/报表全面错乱
 * Per-amount cap (cents): 1 billion yuan
 *  - Beyond this it's rejected: SQLite INTEGER overflow degrades to REAL, and SUM aggregates to Inf/NaN, corrupting balances/net-worth/reports
 */
export const MAX_ABS_CENTS: Cents = 100_000_000_000;

/** 分 → 元纯字符串（两位小数，无千分位），供表单输入回填 / 持仓→输入复用（如复制）/ Cents → plain yuan string (2 decimals, no thousands separators), for form-input backfill / holding→input reuse (e.g. copy) */
export function centsToYuan(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return (negative ? "-" : "") + `${yuan}.${String(fen).padStart(2, "0")}`;
}

/** 元字符串/数字 → 分（最多两位小数）；非法或超上限返回 null / Yuan string/number → cents (max 2 decimals); invalid or over cap → null */
export function yuanToCents(input: string | number): Cents | null {
  const raw = typeof input === "number" ? String(input) : input.trim();
  // 兼容从余额/报表复制进来的格式：去掉千分位逗号、空白、前导正号/常见货币符号；负号保留 / Support pasted values: strip thousands separators, spaces, leading plus/currency symbols; keep minus
  const n = raw.replace(/[,\s]/g, "").replace(/^[+¥￥$€£]/, "");
  // 允许负号：期初余额（如信用卡）可为负；位数上限防超长数字串（另有 MAX_ABS_CENTS 兜底）/ Allow sign: opening balances (e.g. credit cards) may be negative; digit cap blocks over-long strings (MAX_ABS_CENTS is the final guard)
  if (!/^-?\d{1,15}(\.\d{1,2})?$/.test(n)) return null;
  const sign = n.startsWith("-") ? -1 : 1;
  const [i, f = ""] = n.replace(/^-/, "").split(".");
  const cents = sign * (parseInt(i, 10) * 100 + parseInt((f + "00").slice(0, 2), 10));
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_ABS_CENTS) return null;
  return cents;
}

/**
 * 客户端金额字符串 → 数字（元）；空视为 0，非法返回 null。
 * 与 `yuanToCents` 口径一致：剥离千分位逗号、空白、前导正号/常见货币符号（保留负号）。
 * 用于前端校验/实时预览，使所有金额输入框兼容 `1,002.00` 这类千分位格式。
 * Client-side yuan-string → number; empty = 0, invalid = null. Mirrors `yuanToCents` (strips commas/spaces/+symbols, keeps minus). For front-end validation/preview so every amount input accepts `1,002.00`.
 */
export function parseYuanAmount(input: string): number | null {
  const s = input.trim().replace(/[,\s]/g, "").replace(/^[+¥￥$€£]/, "");
  if (s === "") return 0;
  // 与服务端 yuanToCents 口径一致：最多两位小数、位数上限 / Same 2-decimal cap as yuanToCents
  if (!/^-?\d{1,15}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 汇率折算：amountCents（源币种）→ 目标币种分值（保留分）
 *  rate 语义：1 单位该币种 = rate 单位基准币种（如 USD=7.2 表示 1 USD = 7.2 CNY）
 * FX conversion: amountCents (source currency) → target-currency cents (kept in cents)
 *  rate semantics: 1 unit of that currency = rate units of base currency (e.g. USD=7.2 means 1 USD = 7.2 CNY)
 */
export function convertCents(amountCents: Cents, fromRate: string, toRate: string): Cents {
  const from = parseFloat(fromRate) || 1;
  const to = parseFloat(toRate) || 1;
  // 定点整数缩放，避免大数 * 浮点汇率的精度误差（rate 以文本存 DECIMAL，解析后仍可能浮点）/ Fixed-point integer scaling avoids precision loss from large-number × float rate (rates stored as DECIMAL text may still parse to floats)
  const SCALE = 1_000_000;
  const f = Math.round(from * SCALE);
  const t = Math.round(to * SCALE);
  if (t === 0) return 0;
  return Math.round((amountCents * f) / t);
}
