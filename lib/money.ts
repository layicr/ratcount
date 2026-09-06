/**
 * 金额工具：一切运算在整数"分"层进行，避免浮点误差
 *  - 前端只做展示（formatCents），不做加减乘除
 *  - 入参校验统一走 yuanToCents
 */

/** 金额单位：分 */
export type Cents = number;

/** 分 → 元字符串（千分位 + 两位小数） / Cents to display string */
export function formatCents(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const s = `${yuan.toLocaleString("en-US")}.${String(fen).padStart(2, "0")}`;
  return (negative ? "-" : "") + s;
}

/** 元字符串/数字 → 分（最多两位小数）；非法返回 null / Yuan to cents */
export function yuanToCents(input: string | number): Cents | null {
  const n = typeof input === "number" ? String(input) : input.trim();
  // 允许负号：期初余额（如信用卡）可为负
  if (!/^-?\d+(\.\d{1,2})?$/.test(n)) return null;
  const sign = n.startsWith("-") ? -1 : 1;
  const [i, f = ""] = n.replace(/^-/, "").split(".");
  return sign * (parseInt(i, 10) * 100 + parseInt((f + "00").slice(0, 2), 10));
}

/** 汇率折算：amountCents（源币种）→ 目标币种分值（保留分）
 *  rate 语义：1 单位该币种 = rate 单位基准币种（如 USD=7.2 表示 1 USD = 7.2 CNY）
 */
export function convertCents(amountCents: Cents, fromRate: string, toRate: string): Cents {
  const from = parseFloat(fromRate) || 1;
  const to = parseFloat(toRate) || 1;
  // 定点整数缩放，避免大数 * 浮点汇率的精度误差（rate 以文本存 DECIMAL，解析后仍可能浮点）
  const SCALE = 1_000_000;
  const f = Math.round(from * SCALE);
  const t = Math.round(to * SCALE);
  if (t === 0) return 0;
  return Math.round((amountCents * f) / t);
}
