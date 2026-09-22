/**
 * ratcount · UE 测试（用户体验交互流程的可测逻辑层）
 * 覆盖：分页导航窗口、验证码刷新防重放与输入容错、登录失败重试体验、
 *       金额录入校验反馈、报表期间联动、周期计划自动记账推进。
 * 代码路径以 next/frontend 侧纯函数与 lib 层守卫为锚点，保证可在 node 环境断言。
 * 运行：npx tsx --test test/ue-ux.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPageWindow, computeTotalPages } from "../lib/pagination-util";
import { monthRange } from "../lib/sql-utils";
import { createCaptchaToken, verifyCaptchaToken, generateCaptchaCode } from "../lib/auth/captcha";
import { allowAttempt, remainingAttempts, resetAttempts, REGISTER_LIMIT } from "../lib/auth/rate-limit";
import { yuanToCents } from "../lib/money";
import { nextRecurringDate, parseDate, fmtDate } from "../lib/recurring";
import { getPeriodLabel } from "../app/(app)/components/reports/utils";
import { monthKey } from "../lib/queries";

const dict = {
  reports: { periodYear: "{year}年", periodMonth: "{year}年{month}" },
};

/** 桩 translator：从 dict 按 ns.key 取值，缺省返回 key（对齐 next-intl 行为） */
const tl = (key: string) => key.split(".").reduce((o: unknown, p: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined) ?? "", dict) as unknown as string || key;

/* ==================== 1. 列表翻页体验 ==================== */

test("翻页: 任意页可见窗口必含当前页，且不越界（含量=窗口宽度）", () => {
  const total = 23; // 每页 10 → 3 页
  const pageCount = computeTotalPages(total, 10);
  assert.strictEqual(pageCount, 3);
  for (let page = 1; page <= pageCount; page++) {
    const win = buildPageWindow(page, pageCount, 5);
    assert.ok(win.includes(page), `第 ${page} 页可见窗口应含自身`);
    for (const p of win) assert.ok(p >= 1 && p <= pageCount, `窗口页码 ${p} 越界`);
    assert.ok(win.length <= 5);
  }
});

test("翻页: 用户从首页翻到末页，窗口随之滑动且首/末页不被吞", () => {
  const totalPages = 20;
  // 首页窗口从 1 开始
  assert.deepStrictEqual(buildPageWindow(1, totalPages, 5), [1, 2, 3, 4, 5]);
  // 中间页窗口平移
  assert.ok(buildPageWindow(10, totalPages, 5).includes(10));
  // 末页窗口以 totalPages 收尾
  const last = buildPageWindow(totalPages, totalPages, 5);
  assert.strictEqual(last[last.length - 1], totalPages);
  assert.ok(last.includes(totalPages));
});

/* ==================== 2. 验证码交互体验 ==================== */

test("验证码: 输入首尾空格/大小写被容错（用户不易输错）", async () => {
  const token = await createCaptchaToken("AB12");
  assert.strictEqual(await verifyCaptchaToken(token, "  ab12  "), true);
  assert.strictEqual(await verifyCaptchaToken(token, "Ab12"), true);
});

test("验证码: token 本身不含答案明文（防网络/日志窃听）", async () => {
  const code = "AB12";
  const token = await createCaptchaToken(code);
  assert.ok(typeof token === "string" && token.length > 0);
  // 签发 token 与答案隔离，答案只能通过 verify 比对还原
  assert.ok(!token.includes(code), "token 不得内嵌答案明文");
  assert.strictEqual(await verifyCaptchaToken(token, code), true);
});

test("验证码: 生成字符均属安全字符集（排除 0/O/1/I 便于人眼识别）", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generateCaptchaCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  }
});

/* ==================== 3. 登录失败重试体验 ==================== */

test("登录: 失败后剩余次数递减提示，成功登录后恢复全量尝试", () => {
  const ip = "198.51.100.7";
  const key = `login:${ip}`;
  resetAttempts(key);
  assert.strictEqual(remainingAttempts(key), REGISTER_LIMIT.max);
  for (let i = 1; i <= REGISTER_LIMIT.max; i++) {
    assert.strictEqual(allowAttempt(key), true);
    assert.strictEqual(remainingAttempts(key), REGISTER_LIMIT.max - i, `第 ${i} 次失败后剩余提示`);
  }
  assert.strictEqual(remainingAttempts(key), 0);
  // 用户输入正确密码登录成功 → 解除限流
  resetAttempts(key);
  assert.strictEqual(remainingAttempts(key), REGISTER_LIMIT.max);
  assert.strictEqual(allowAttempt(key), true);
});

/* ==================== 4. 金额录入校验反馈 ==================== */

test("录入: 合法金额被解析为用户可见分值，非法输入返回 null 触发校验提示", () => {
  assert.strictEqual(yuanToCents("48.50"), 4850);
  assert.strictEqual(yuanToCents("0.5"), 50);
  assert.strictEqual(yuanToCents("12"), 1200);
  // 非法输入 → null，表单需提示"请输入正确金额（如 12.50）"
  assert.strictEqual(yuanToCents("12."), null);
  assert.strictEqual(yuanToCents("1.234"), null);
  assert.strictEqual(yuanToCents("abc"), null);
  assert.strictEqual(yuanToCents(""), null);
});

/* ==================== 5. 报表期间联动 ==================== */

test("期间: 选择某月后，查询范围与展示标签一致（用户看到的即是查到的）", () => {
  const period = { type: "month", year: 2026, month: 2 } as const;
  const label = getPeriodLabel(period, "zh-CN", tl);
  const range = monthRange(2026, 2);
  // Intl zh-CN 短月名输出为「2月」而非「二月」，断言与 Intl 行为对齐
  assert.strictEqual(label, "2026年2月");
  assert.strictEqual(range.start, "2026-02-01");
  assert.strictEqual(range.end, "2026-02-28");
  // 同月两条信息必须来自同一选择，不存在标签与范围的错位
  assert.ok(label.includes("2月") === (range.end === "2026-02-28"));
});

test("期间: 最近 6 个月趋势槽位与 monthKey 格式一致（图表轴映射）", () => {
  for (let i = 0; i < 6; i++) {
    const d = new Date(2026, 8 - i, 1); // 09 - i 月
    assert.match(monthKey(d), /^\d{4}-(0[1-9]|1[0-2])$/);
  }
});

/* ==================== 6. 周期计划自动记账推进 ==================== */

test("周期: 自动记账视角下 nextDate 单调推进（daily→次日/weekly→下周/monthly→下月同日）", () => {
  const d = "2026-09-06";
  const daily = nextRecurringDate("daily", d);
  const weekly = nextRecurringDate("weekly", d);
  const monthly = nextRecurringDate("monthly", d);
  assert.ok(daily > d && fmtDate(parseDate(daily)) === "2026-09-07");
  assert.strictEqual(weekly, "2026-09-13");
  assert.strictEqual(monthly, "2026-10-06");
});

test("周期: 月度自动记账不会因 31 号而失败（超月取月末）", () => {
  assert.strictEqual(nextRecurringDate("monthly", "2026-01-31", { dayOfMonth: 31 }), "2026-02-28");
  assert.strictEqual(nextRecurringDate("monthly", "2028-01-31", { dayOfMonth: 31 }), "2028-02-29");
});
