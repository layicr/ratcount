/** 历史流水数据（2026-03 ~ 2026-08），seed.ts 用于写入数据库 + 计算期初轧差 / Historical transactions (2026-03 ~ 2026-08); seed.ts uses them to write rows + compute opening offsets */
import { type AcctKey } from "./types";
import { TX, type TransactionType } from "../../lib/constants";

export type HistTx = {
  acct: AcctKey;
  toAcct?: AcctKey;
  type: TransactionType;
  /** 金额单位：账户原币的「元」（便于阅读），实际写入时分 × 100；USD 账户的 60 = $60 / Amount in the account's native currency units (written as cents × 100); 60 on the USD account = $60 */
  yuan: number;
  date: string;
  cat?: string;
  project?: string;
  remark: string;
};

/** 历史流水数组，按时间顺序排列 / Historical transaction array, in chronological order */
export const HIST_TX: HistTx[] = [
  // 2026-03
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-03-10", cat: "工资", remark: "3 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-03-10", cat: "房贷", remark: "3 月房贷扣款" },
  { acct: "cmb", type: TX.expense, yuan: 320, date: "2026-03-18", cat: "餐饮", remark: "周末家庭聚餐" },
  { acct: "cash", type: TX.expense, yuan: 480, date: "2026-03-25", cat: "宝宝", project: "宝贝计划", remark: "宝宝用品" },
  // 2026-04
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-04-10", cat: "工资", remark: "4 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-04-10", cat: "房贷", remark: "4 月房贷扣款" },
  { acct: "wechat", type: TX.expense, yuan: 128, date: "2026-04-12", cat: "餐饮", remark: "外卖 · 工作日午餐" },
  { acct: "credit", type: TX.expense, yuan: 2380, date: "2026-04-15", cat: "交通", remark: "出差 · 上海往返机票" },
  { acct: "cash", type: TX.expense, yuan: 1200, date: "2026-04-20", cat: "其他", project: "奶茶店", remark: "奶茶店 · 原料采购" },
  { acct: "cmb", type: TX.expense, yuan: 860, date: "2026-04-28", cat: "医疗", project: "宝贝计划", remark: "康复机构 · 月费" },
  // 2026-05
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-05-10", cat: "工资", remark: "5 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-05-10", cat: "房贷", remark: "5 月房贷扣款" },
  { acct: "cmb", type: TX.expense, yuan: 3600, date: "2026-05-08", cat: "教育", remark: "线上课程 · 年费" },
  { acct: "wechat", type: TX.expense, yuan: 216, date: "2026-05-16", cat: "娱乐", remark: "电影票 ×2" },
  { acct: "cmb", toAcct: "stock", type: TX.transfer, yuan: 3000, date: "2026-05-25", remark: "基金定投 · 转入 A股账户" },
  { acct: "cash", type: TX.expense, yuan: 260, date: "2026-05-30", cat: "餐饮", remark: "菜市场采购" },
  // 2026-06
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-06-10", cat: "工资", remark: "6 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-06-10", cat: "房贷", remark: "6 月房贷扣款" },
  { acct: "cmb", type: TX.expense, yuan: 1280, date: "2026-06-14", cat: "宝宝", project: "宝贝计划", remark: "奶粉 + 纸尿裤" },
  { acct: "credit", type: TX.expense, yuan: 500, date: "2026-06-20", cat: "交通", remark: "加油 · 中石化" },
  { acct: "cmb", toAcct: "stock", type: TX.transfer, yuan: 3000, date: "2026-06-25", remark: "基金定投 · 转入 A股账户" },
  { acct: "cmb", type: TX.expense, yuan: 1580, date: "2026-06-30", cat: "医疗", remark: "全家体检" },
  // 2026-07
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-07-10", cat: "工资", remark: "7 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-07-10", cat: "房贷", remark: "7 月房贷扣款" },
  { acct: "cash", type: TX.income, yuan: 1200, date: "2026-07-05", cat: "生意进账", project: "奶茶店", remark: "奶茶店 · 周流水" },
  { acct: "wechat", type: TX.expense, yuan: 388, date: "2026-07-18", cat: "餐饮", remark: "朋友聚餐 AA" },
  { acct: "cmb", toAcct: "stock", type: TX.transfer, yuan: 3000, date: "2026-07-25", remark: "基金定投 · 转入 A股账户" },
  { acct: "credit", type: TX.expense, yuan: 4200, date: "2026-07-31", cat: "娱乐", remark: "暑期旅行 · 酒店" },
  // 2026-08
  { acct: "cmb", type: TX.income, yuan: 20000, date: "2026-08-10", cat: "工资", remark: "8 月工资到账" },
  { acct: "cmb", type: TX.expense, yuan: 6500, date: "2026-08-10", cat: "房贷", remark: "8 月房贷扣款" },
  { acct: "cmb", type: TX.expense, yuan: 5800, date: "2026-08-12", cat: "教育", remark: "兴趣班 · 秋季学期" },
  { acct: "usd", type: TX.income, yuan: 60, date: "2026-08-20", cat: "其他收入", remark: "美元账户利息" }, // $60（原币口径，基准 ≈ ¥432）/ $60 (native; ≈¥432 in base)
  { acct: "cash", type: TX.expense, yuan: 176, date: "2026-08-22", cat: "餐饮", remark: "楼下早餐" },
  { acct: "cmb", toAcct: "stock", type: TX.transfer, yuan: 3000, date: "2026-08-25", remark: "基金定投 · 转入 A股账户" },
  { acct: "cmb", type: TX.income, yuan: 380, date: "2026-08-28", cat: "投资收益", remark: "黄金 ETF 分红" },
];

/**
 * 历史流水净额（分）：每账户 netDelta[acct] = Σ(收入) − Σ(支出)
 * 用途：accounts.ts 计算 openingBalanceCents = 目标余额 − netDelta[acct]
 * Historical transaction net (cents): netDelta[acct] = Σ(income) − Σ(expense).
 * Used by accounts.ts: openingBalanceCents = target balance − netDelta[acct].
 */
export function computeHistDelta(): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (k: string, v: number) =>
    delta.set(k, (delta.get(k) ?? 0) + v);
  for (const t of HIST_TX) {
    const cents = Math.round(t.yuan * 100);
    add(t.acct, t.type === "income" ? cents : -cents);
    if (t.type === "transfer" && t.toAcct) add(t.toAcct, cents);
  }
  return delta;
}
