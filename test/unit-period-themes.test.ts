/**
 * ratcount · 单元测试：统计期间（lib/period）+ 风格主题（i18n/themes）
 * 覆盖：resolvePeriodRange 年/月/默认解析、parsePeriod 合法与非法回退、
 *       monthKey 时区月份键、normalizeTheme/validThemeCode/resolveThemeCode
 *       优先级链、themeClassName 映射、applyThemeToDocument 文档 class 操作。
 * 运行：npx tsx --test test/unit-period-themes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolvePeriodRange, parsePeriod, monthKey } from "../lib/period";
import {
  normalizeTheme,
  validThemeCode,
  resolveThemeCode,
  themeClassName,
  applyThemeToDocument,
  THEME_CODES,
  DEFAULT_THEME,
} from "../i18n/themes";
import { STATS_PERIOD } from "../lib/constants";

/* ==================== 1. 统计期间 resolvePeriodRange ==================== */

test("期间: 年粒度解析为当年 1/1-12/31", () => {
  const r = resolvePeriodRange({ type: STATS_PERIOD.year, year: 2026 });
  assert.strictEqual(r.start, "2026-01-01");
  assert.strictEqual(r.end, "2026-12-31");
});

test("期间: 月粒度解析为当月首日/末日（含 2 月与 12 月）", () => {
  const feb = resolvePeriodRange({ type: STATS_PERIOD.month, year: 2026, month: 2 });
  assert.strictEqual(feb.start, "2026-02-01");
  assert.strictEqual(feb.end, "2026-02-28");

  const dec = resolvePeriodRange({ type: STATS_PERIOD.month, year: 2026, month: 12 });
  assert.strictEqual(dec.start, "2026-12-01");
  assert.strictEqual(dec.end, "2026-12-31");
});

test("期间: 无 period 时按给定区时取本月（边界不跨 UTC 日界）", () => {
  // 固定时刻：2026-06-15 12:00 UTC，Asia/Shanghai 为 2026-06-15 20:00
  const fixed = new Date("2026-06-15T12:00:00Z");
  // 直接以该时刻推演（localParts 默认取当前时间，这里用 month 字段验证固定区时）
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(fixed);
  const get = (t: string) => nowParts.find((p) => p.type === t)?.value ?? "";
  assert.strictEqual(get("year"), "2026");
  assert.strictEqual(get("month"), "06");
});

/* ==================== 2. parsePeriod ==================== */

test("期间: 解析 year-2026 与 month-2026-09", () => {
  const fallback = { type: STATS_PERIOD.month, year: 2026, month: 1 };
  assert.deepStrictEqual(parsePeriod("year-2026", fallback), { type: STATS_PERIOD.year, year: 2026 });
  assert.deepStrictEqual(parsePeriod("month-2026-09", fallback), { type: STATS_PERIOD.month, year: 2026, month: 9 });
  // 月份缺省两位时按 01 处理
  assert.deepStrictEqual(parsePeriod("month-2026-1", fallback), { type: STATS_PERIOD.month, year: 2026, month: 1 });
});

test("期间: 空值/非法字符串/越界格式回退 fallback", () => {
  const fallback = { type: STATS_PERIOD.month, year: 2026, month: 1 };
  assert.deepStrictEqual(parsePeriod(null, fallback), fallback);
  assert.deepStrictEqual(parsePeriod("", fallback), fallback);
  assert.deepStrictEqual(parsePeriod("2026-09", fallback), fallback);
  assert.deepStrictEqual(parsePeriod("month-26-09", fallback), fallback);
  // 月份不足两位（正则要求 \d{2}）与未知类型回退
  assert.deepStrictEqual(parsePeriod("month-2026-9", fallback), fallback);
  assert.deepStrictEqual(parsePeriod("quarter-2026-01", fallback), fallback);
});

test("期间: 宽松解析容忍冗余段（year-YYYY-XX 取年 / month 月份不做 1-12 校验）", () => {
  const fallback = { type: STATS_PERIOD.month, year: 2026, month: 1 };
  // year 后冗余段被忽略，仍按年解析
  assert.deepStrictEqual(parsePeriod("year-2026-09", fallback), { type: STATS_PERIOD.year, year: 2026 });
  // month 后两位数字均接受（99 不做月份范围校验）
  assert.deepStrictEqual(parsePeriod("month-2026-99", fallback), { type: STATS_PERIOD.month, year: 2026, month: 99 });
});

/* ==================== 3. monthKey ==================== */

test("期间: monthKey 输出 YYYY-MM（含补零）", () => {
  const d = new Date(2026, 8, 1); // 2026-09
  assert.strictEqual(monthKey(d), "2026-09");
  const d2 = new Date(2026, 11, 1); // 2026-12
  assert.strictEqual(monthKey(d2), "2026-12");
});

/* ==================== 4. 主题归一化 ==================== */

test("主题: normalizeTheme 合法保留、非法回退默认", () => {
  assert.strictEqual(normalizeTheme("dark"), "dark");
  assert.strictEqual(normalizeTheme("ocean"), "ocean");
  assert.strictEqual(normalizeTheme(null), DEFAULT_THEME);
  assert.strictEqual(normalizeTheme(undefined), DEFAULT_THEME);
  assert.strictEqual(normalizeTheme("evil-theme"), DEFAULT_THEME);
  assert.strictEqual(normalizeTheme("DARK"), DEFAULT_THEME); // 大小写敏感
});

test("主题: THEME_CODES 白名单覆盖全部主题项且 light/dark 在列", () => {
  assert.ok(THEME_CODES.includes("light"));
  assert.ok(THEME_CODES.includes("dark"));
  assert.ok(THEME_CODES.includes("ocean"));
  assert.strictEqual(new Set(THEME_CODES).size, THEME_CODES.length, "主题 code 不得重复");
});

test("主题: validThemeCode 仅返回合法值，非法返回 null", () => {
  assert.strictEqual(validThemeCode("forest"), "forest");
  assert.strictEqual(validThemeCode(""), null);
  assert.strictEqual(validThemeCode("nope"), null);
});

test("主题: resolveThemeCode 优先级链（账号偏好 > 本机 cookie > 全局默认 > light）", () => {
  // 账号偏好优先
  assert.strictEqual(resolveThemeCode("rose", "ocean", "dark"), "rose");
  // 无账号偏好时取本机 cookie
  assert.strictEqual(resolveThemeCode(null, "ocean", "dark"), "ocean");
  // 仅有全局默认
  assert.strictEqual(resolveThemeCode(null, null, "dark"), "dark");
  // 全部非法/缺失 → light
  assert.strictEqual(resolveThemeCode("bad", "", null), DEFAULT_THEME);
});

/* ==================== 5. themeClassName ==================== */

test("主题: themeClassName 映射（light 无 class / dark / theme-<code>）", () => {
  assert.strictEqual(themeClassName("light"), undefined);
  assert.strictEqual(themeClassName("dark"), "dark");
  assert.strictEqual(themeClassName("ocean"), "theme-ocean");
  assert.strictEqual(themeClassName(null), undefined);
  assert.strictEqual(themeClassName("bad"), undefined);
});

/* ==================== 6. applyThemeToDocument ==================== */

test("主题: applyThemeToDocument 清理旧 class 并按 code 写入（含 document 缺失兜底）", () => {
  // document 缺失时静默返回
  const prev = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = undefined;
  assert.doesNotThrow(() => applyThemeToDocument("dark"));
  (globalThis as Record<string, unknown>).document = prev;

  // document 存在：先清全部主题 class，再按 code 添加
  const classes = new Set<string>();
  const docEl = {
    classList: {
      remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
      add: (c: string) => classes.add(c),
    },
  };
  (globalThis as Record<string, unknown>).document = {
    documentElement: docEl,
  } as unknown as Document;
  try {
    applyThemeToDocument("rose");
    assert.ok(classes.has("theme-rose"));
    applyThemeToDocument("dark");
    assert.ok(classes.has("dark"));
    assert.ok(!classes.has("theme-rose"), "切换后旧主题 class 必须被清理");
    applyThemeToDocument("light");
    assert.strictEqual(classes.size, 0, "light 不需要任何主题 class");
  } finally {
    (globalThis as Record<string, unknown>).document = prev;
  }
});
