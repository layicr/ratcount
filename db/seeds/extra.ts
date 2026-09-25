/**
 * 周期计划 + 余额快照 + 操作日志 定义数据（seed 专用）/ Recurring plans + balance snapshots + audit logs (seed-only)
 */
import { type AcctKey } from "./types";

// ── 周期计划 / Recurring plans ──────────────────────────────────────────────────

export type RecurringDef = {
  name: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  dayOfMonth?: number;
  dayOfWeek?: number;
  accountId: AcctKey;
  toAccountId?: AcctKey;
  categoryId?: string;
  /** 下次执行日期（种子写入时的值）/ next run date (as seeded) */
  nextDate: string;
  status: "active" | "paused";
  remark: string;
};

export const RECURRING_DEFS: RecurringDef[] = [
  {
    name: "每月房贷", type: "expense", amountCents: 650000,
    frequency: "monthly", dayOfMonth: 10,
    accountId: "cmb", categoryId: "房贷",
    nextDate: "2026-09-10", status: "active",
    remark: "招行按揭 · 每月 10 日扣款",
  },
  {
    name: "工资入账", type: "income", amountCents: 2000000,
    frequency: "monthly", dayOfMonth: 10,
    accountId: "cmb", categoryId: "工资",
    nextDate: "2026-09-10", status: "active",
    remark: "月薪 · 每月 10 日",
  },
  {
    name: "公寓租金", type: "income", amountCents: 480000,
    frequency: "monthly", dayOfMonth: 5,
    accountId: "cmb", categoryId: "其他收入",
    nextDate: "2026-09-05", status: "active",
    remark: "朝阳公寓 · 月租",
  },
  {
    name: "基金定投", type: "transfer", amountCents: 300000,
    frequency: "monthly", dayOfMonth: 25,
    accountId: "cmb", toAccountId: "stock",
    nextDate: "2026-09-25", status: "active",
    remark: "招行 → A股账户",
  },
  {
    name: "每周生鲜采购", type: "expense", amountCents: 18000,
    frequency: "weekly", dayOfWeek: 6,
    accountId: "wechat", categoryId: "餐饮",
    nextDate: "2026-09-12", status: "active",
    remark: "周六超市",
  },
  {
    name: "视频会员", type: "expense", amountCents: 2500,
    frequency: "monthly", dayOfMonth: 18,
    accountId: "credit", categoryId: "娱乐",
    nextDate: "2026-09-18", status: "paused",
    remark: "已暂停（连续包月关闭）",
  },
  {
    name: "储蓄型保险缴费", type: "expense", amountCents: 380000,
    frequency: "yearly", dayOfMonth: 1,
    accountId: "insurance", categoryId: "消费型保险",
    nextDate: "2026-10-01", status: "active",
    remark: "重疾险 · 年缴保费",
  },
];

// ── 余额快照 / Balance snapshots ─────────────────────────────────────────────────

export type BalanceDef = {
  accountId: AcctKey;
  balanceAmountCents: number;
  snapshotDate: string;
  remark?: string;
};

/**
 * 09-01 快照。
 * 前 8 个有历史流水的账户快照值 = 期末余额（演示数据截至 09-01）；
 * 后 7 个新增账户无历史流水，快照 = 期初。
 * 现金快照差 −50 元用于演示「待对账」场景。
 * 09-01 snapshot.
 * The first 8 accounts with history: snapshot = period-end balance (demo data ends 09-01).
 * The last 7 added accounts: insurance/loan/digital_asset/collectible gain history from holding buy-transfers, others none; snapshots are self-consistent (opening + history = snapshot).
 * The cash snapshot differs by −50 yuan to demonstrate the "needs reconciliation" case.
 */
export const BALANCE_DEFS: BalanceDef[] = [
  { accountId: "cash",         balanceAmountCents: 15000,  snapshotDate: "2026-09-01", remark: "快照差异 -50 元待核对" },
  { accountId: "cmb",          balanceAmountCents: 9580600, snapshotDate: "2026-09-01" },
  { accountId: "credit",       balanceAmountCents: -486000, snapshotDate: "2026-09-01" },
  { accountId: "wechat",       balanceAmountCents: 645200, snapshotDate: "2026-09-01" },
  { accountId: "stock",        balanceAmountCents: 15200000, snapshotDate: "2026-09-01" },
  // 原币口径：$166.67（基准 ≈ ¥1,200，由 seed 按汇率折算）/ native: $166.67 (≈¥1,200 in base, converted in seed)
  { accountId: "usd",          balanceAmountCents: 16667, snapshotDate: "2026-09-01" },
  { accountId: "bond",         balanceAmountCents: 8000000, snapshotDate: "2026-09-01" },
  { accountId: "gold",         balanceAmountCents: 2644000, snapshotDate: "2026-09-01" },
  // 新增保障类 / 资产类账户（无历史流水，余额 = 期初）/ Added protection / asset accounts (no history, balance = opening)
  { accountId: "insurance",    balanceAmountCents: 5000000, snapshotDate: "2026-09-01" },
  { accountId: "national_pension", balanceAmountCents: 6000000, snapshotDate: "2026-09-01" },
  { accountId: "personal_pension", balanceAmountCents: 2500000, snapshotDate: "2026-09-01" },
  { accountId: "housing_fund", balanceAmountCents: 8000000, snapshotDate: "2026-09-01" },
  { accountId: "loan",         balanceAmountCents: 10000000, snapshotDate: "2026-09-01" },
  { accountId: "digital_asset", balanceAmountCents: 3000000, snapshotDate: "2026-09-01" },
  { accountId: "collectible",  balanceAmountCents: 2000000, snapshotDate: "2026-09-01" },
];

// ── 操作日志 / Audit logs ───────────────────────────────────────────────────────

export type AuditLogDef = {
  action: "C" | "U" | "D";
  entity: string;
  summary: string;
  requestBody: string;
  responseBody: string;
  ip: string;
};

export const AUDIT_LOG_DEFS: AuditLogDef[] = [
  {
    action: "C", entity: "transaction",
    summary: "新增流水 山姆会员店 -¥486",
    requestBody: JSON.stringify({ amountYuan: "486.00", accountId: "cmb" }),
    responseBody: '{"result":"created"}',
    ip: "127.0.0.1",
  },
  {
    action: "C", entity: "transaction",
    summary: "新增流水 康复机构 · 月费 -¥1860",
    requestBody: JSON.stringify({ amountYuan: "1860.00", projectId: "babyPlan" }),
    responseBody: '{"result":"created"}',
    ip: "127.0.0.1",
  },
  {
    action: "C", entity: "investment",
    summary: "新增投资持仓 贵州茅台",
    requestBody: JSON.stringify({ type: "stock", name: "贵州茅台", costYuan: "148000.00" }),
    responseBody: '{"result":"created"}',
    ip: "127.0.0.1",
  },
  {
    action: "U", entity: "account",
    summary: "修改账户 招行储蓄卡",
    requestBody: JSON.stringify({ name: "招行储蓄卡", icon: "🏦" }),
    responseBody: '{"result":"updated"}',
    ip: "127.0.0.1",
  },
  {
    action: "U", entity: "investment",
    summary: "卖出投资持仓 比亚迪",
    requestBody: JSON.stringify({ amountYuan: "62400.00" }),
    responseBody: '{"result":"sold"}',
    ip: "127.0.0.1",
  },
  {
    action: "D", entity: "transaction",
    summary: "删除流水 测试记录",
    requestBody: JSON.stringify({ id: "sam-tx-id" }),
    responseBody: '{"result":"deleted"}',
    ip: "127.0.0.1",
  },
];
