/**
 * 投资 ↔ 流水联动 · 纯计算（lib/investment-flow.ts）
 *  - 与 UI / DB 解耦，便于单元测试
 *  - 金额统一为「分」（整数）；利率统一为「年利率小数」（2.6% → 0.026）
 *  - 计息约定：单利按天，利息 = 本金 × 年利率 × 天数 ÷ 365
 * Investment ↔ transaction linkage — pure calculations (lib/investment-flow.ts)
 *  - Decoupled from UI / DB for easy unit testing
 *  - Amounts are in cents (integers); rates are annual-decimal (2.6% → 0.026)
 *  - Interest convention: simple interest per day, interest = principal × annualRate × days ÷ 365
 */
import { parseDate, fmtDate } from "./recurring";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 是否合法 YYYY-MM-DD / Whether a string is a valid YYYY-MM-DD date */
export function isDateStr(s: string | null | undefined): s is string {
  return typeof s === "string" && DATE_RE.test(s);
}

/** 今天（YYYY-MM-DD，UTC）/ Today as YYYY-MM-DD (UTC) */
export function todayStr(): string {
  return fmtDate(new Date());
}

/**
 * 解析利率文本 → 年利率小数
 *  "2.60%" → 0.026；"2.60" → 0.026（无百分号同样按百分数处理）；非法 → null
 * Parse a rate string → annual-decimal
 *  "2.60%" → 0.026; "2.60" → 0.026 (treated as percent even without %); invalid → null
 */
export function parseAnnualRate(rate: string | null | undefined): number | null {
  if (rate == null) return null;
  const cleaned = String(rate).trim().replace(/%/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/**
 * 利率归一化（展示/入库统一口径）：去首尾空白与百分号，空值返回 null，否则末尾补 %。
 * 幂等：normalizeInterestRate("2.6") === normalizeInterestRate("2.6%") === "2.6%"；
 * 与 parseAnnualRate 配套——存储带 %，解析时再去 %，两端口径一致。
 */
export function normalizeInterestRate(rate: string | null | undefined): string | null {
  if (rate == null) return null;
  const cleaned = String(rate).trim().replace(/%/g, "").trim();
  if (!cleaned) return null;
  return `${cleaned}%`;
}

/** 两个日期相差天数（UTC，end - start）；非法输入返回 null / Days between two dates (UTC, end - start); invalid input → null */
export function daysBetween(start: string, end: string): number | null {
  if (!isDateStr(start) || !isDateStr(end)) return null;
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

/** 计息基准：365 = ACT/365（借贷沿用），360 = 30/360（固收切此）/ Day-count basis: 365 = ACT/365 (loans), 360 = 30/360 (fixed income) */
export type DayCountBasis = "365" | "360";

/**
 * 30/360 计息天数（常规 European 30/360）：月差×30 + 日差，日端取 min(day, 30)
 *   D1=31→30；D2=31→30。仅用于利息估算，误差业务可接受。非法输入返回 null。
 * 30/360 day count (standard European): month-diff×30 + day-diff, day capped at 30.
 * Used for interest estimates only. Invalid input → null.
 */
export function days360(start: string, end: string): number | null {
  if (!isDateStr(start) || !isDateStr(end)) return null;
  const d1 = parseDate(start);
  const d2 = parseDate(end);
  let day1 = d1.getUTCDate();
  let day2 = d2.getUTCDate();
  if (day1 === 31) day1 = 30;
  if (day2 === 31) day2 = 30;
  return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 360 + (d2.getUTCMonth() - d1.getUTCMonth()) * 30 + (day2 - day1);
}

/** 实际成本 = 成本金额 + 交易费用 / Actual cost = cost amount + transaction fee */
export function actualCostCents(costCents: number, feeCents: number): number {
  return costCents + feeCents;
}

/** 单利按天：到期本息 = 本金 × (1 + 年利率 × 天数 ÷ basis)；天数非正时只还本金；basis 默认 365（借贷），固收传 360 / Simple interest per day: maturity = principal × (1 + annualRate × days ÷ basis); non-positive days → principal only; basis defaults 365 (loans), 360 for fixed income */
export function calcMaturityCents(principalCents: number, annualRate: number, days: number, basis: DayCountBasis = "365"): number {
  if (days <= 0) return Math.round(principalCents);
  const divisor = basis === "360" ? 360 : 365;
  return Math.round(principalCents * (1 + (annualRate * days) / divisor));
}

/** 盈亏 = 到账金额 − 实际成本（正=赚 / 负=亏）/ Profit = amount received − actual cost (positive = gain, negative = loss) */
export function profitCents(amountCents: number, costCents: number): number {
  return amountCents - costCents;
}

/**
 * 持仓单行收益（含派息）：估值 − 成本 − 费用 + 累计派息
 *  - 派息时市值已同步除权，故「浮盈 + 累计派息」不重复计量
 *  - 定期 / 国债等的「估值」传本息预估；其余传当前市值
 *  - 仅投资列表（investment-type-table）按行调用；投资总览与报表各自用 SQL/查询聚合（当前不并派息），口径未统一
 * Per-row holding profit (includes dividends): value − cost − fee + cumulative dividends
 *  - At dividend time the market value is already adjusted ex-dividend, so "unrealized gain + cumulative dividends" is not double-counted
 *  - For deposits / bonds pass the accrued principal+interest estimate as value; otherwise pass current market value
 *  - Called per row only by the investment list table; overview and reports use their own SQL/query aggregation (no dividends yet) — definitions not unified
 */
export function holdingProfitCents(h: {
  valueCents: number;
  costCents: number;
  feeCents: number;
  dividendCents: number;
}): number {
  return h.valueCents - h.costCents - h.feeCents + h.dividendCents;
}

/**
 * 部分卖出：按卖出数量占比分摊成本 / 费用
 *  - sellQty <= 0 或无数量口径（quantity = 0）→ 视为整仓卖出（ratio = 1）
 *  - 结转成本四舍五入（Math.round）到分后，剩余部分 = 原值 − 结转（两侧相加恒等于原值，无漂移）
 * Partial sell: allocate cost / fee by sold-quantity ratio
 *  - sellQty <= 0 or no quantity basis (quantity = 0) → treat as full sell-out (ratio = 1)
 *  - After rounding carried cost (Math.round) to the cent, remainder = original − carried (both sides always sum to the original, no drift)
 */
export function prorateSell(
  h: { quantity: number; costCents: number; feeCents: number; currentValueCents: number },
  sellQty: number,
): {
  ratio: number;
  costPart: number; // 本次结转成本 / carried cost this time
  feePart: number; // 本次结转费用 / carried fee this time
  cost: number; // 本次结转实际成本 = 成本 + 费用 / carried actual cost = cost + fee
  isFull: boolean;
  remainingQuantity: number;
  remainingCostCents: number;
  remainingFeeCents: number;
  remainingValueCents: number;
} {
  const ratio = sellQty > 0 && h.quantity > 0 ? sellQty / h.quantity : 1;
  const costPart = Math.round(h.costCents * ratio);
  const feePart = Math.round(h.feeCents * ratio);
  const isFull = ratio >= 1;
  return {
    ratio,
    costPart,
    feePart,
    cost: costPart + feePart,
    isFull,
    remainingQuantity: isFull ? h.quantity : h.quantity - sellQty,
    remainingCostCents: h.costCents - costPart,
    remainingFeeCents: h.feeCents - feePart,
    remainingValueCents: isFull
      ? h.currentValueCents
      : Math.max(0, Math.round(h.currentValueCents * (1 - ratio))),
  };
}

/**
 * 定期 / 国债到期默认到账金额
 *  按「本金 × (1 + 年利率 × 天数 ÷ 365)」自动算；
 *  利率缺失、起息日缺失或无法解析时回退当前市值；到期日缺失时用今天。
 * Default maturity amount for deposits / bonds
 *  Auto-computed as "principal × (1 + annualRate × days ÷ 365)";
 *  falls back to current market value when rate / start date is missing or unparseable; uses today when maturity date is missing.
 */
export function defaultMaturityCents(p: {
  principalCents: number;
  interestRate: string | null | undefined;
  startDate: string | null | undefined;
  maturityDate: string | null | undefined;
  fallbackCents: number;
  basis?: DayCountBasis;
}): number {
  const rate = parseAnnualRate(p.interestRate);
  if (rate === null || !isDateStr(p.startDate)) return p.fallbackCents;
  const end = isDateStr(p.maturityDate) ? p.maturityDate : todayStr();
  // 天数口径须与基准一致：360 → 30/360 天数，365 → 实际天数（ACT/365）
  const use360 = (p.basis ?? "365") === "360";
  const days = use360 ? days360(p.startDate, end) : daysBetween(p.startDate, end);
  if (days === null) return p.fallbackCents;
  return calcMaturityCents(p.principalCents, rate, days, p.basis ?? "365");
}

/**
 * 定期 / 国债本息预估（列表展示用）：本金 × (1 + 年利率 × 天数 ÷ 365)
 *  - 天数 = 起息日 → 截止日；截止日取「今天 / 到期日」中较早者
 *    （未到期 → 算到今天，显示应计本息；到期日已过 → 按到期日算满期）
 *  - 利率、起息日缺失或无法解析、天数非正 → 回退本金
 *  - 与 defaultMaturityCents 的区别：后者始终按到期日算满期（旧口径，现已不再用于到期弹窗，仅保留备用）
 * Accrued principal+interest estimate for deposits / bonds (for list display): principal × (1 + annualRate × days ÷ 365)
 *  - days = start date → cutoff, where cutoff is the earlier of today / maturity date
 *    (before maturity → accrue to today; after maturity → use maturity date for full term)
 *  - missing/unparseable rate or start date, or non-positive days → fall back to principal
 *  - Differs from defaultMaturityCents, which always uses the maturity date (legacy; no longer used for the maturity dialog, kept only as fallback)
 */
export function estimateAccruedCents(p: {
  principalCents: number;
  interestRate: string | null | undefined;
  startDate: string | null | undefined;
  maturityDate: string | null | undefined;
  /** 便于测试注入「今天」，缺省取实际今天 / Inject "today" for tests; defaults to the real today */
  today?: string;
  /** 计息基准：默认 365（借贷）；固收传 360（30/360）/ Day-count basis: default 365 (loans); 360 (30/360) for fixed income */
  basis?: DayCountBasis;
}): number {
  const rate = parseAnnualRate(p.interestRate);
  if (rate === null || !isDateStr(p.startDate)) return Math.round(p.principalCents);
  const today = p.today ?? todayStr();
  // YYYY-MM-DD 可直接字典序比较：到期日早于今天 → 用到期日（满期），否则算到今天 / YYYY-MM-DD compares lexicographically: if maturity < today use maturity (full term), else accrue to today
  const end = isDateStr(p.maturityDate) && p.maturityDate < today ? p.maturityDate : today;
  // 天数口径须与基准一致：360 → 30/360 天数，365 → 实际天数（ACT/365）
  // Day count must match the basis: 360 → 30/360 days, 365 → actual days (ACT/365)
  const use360 = (p.basis ?? "365") === "360";
  const days = use360 ? days360(p.startDate, end) : daysBetween(p.startDate, end);
  if (days === null) return Math.round(p.principalCents);
  return calcMaturityCents(p.principalCents, rate, days, p.basis ?? "365");
}

/**
 * 建仓表单「满期预览」：基于本金、年利率、起息日→到期日，按 30/360 算「预计到期利息」与「到期总额」。
 *  - 利率缺失/非法、起息日或到期日缺失/非法、天数非正 → 返回 null（不渲染预览）
 *  - basis 默认 365（借贷不改），固收传 "360"
 * Full-term preview for the create form: principal × (1 + annualRate × days360 ÷ basis).
 * Returns { interestCents, totalCents } or null when inputs are incomplete/invalid.
 */
export function estimateMaturityPreview(p: {
  principalCents: number;
  interestRate: string | null | undefined;
  purchaseDate: string | null | undefined;
  maturityDate: string | null | undefined;
  basis?: DayCountBasis;
}): { interestCents: number; totalCents: number } | null {
  const rate = parseAnnualRate(p.interestRate);
  if (rate === null || !isDateStr(p.purchaseDate) || !isDateStr(p.maturityDate)) return null;
  const days = days360(p.purchaseDate, p.maturityDate);
  if (days === null || days <= 0) return null;
  const totalCents = calcMaturityCents(p.principalCents, rate, days, p.basis ?? "365");
  return { interestCents: Math.max(0, totalCents - p.principalCents), totalCents };
}
