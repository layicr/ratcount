/**
 * ratcount · 纯函数补充测试（无 DB 依赖）
 *
 * 覆盖现有测试未触达的纯逻辑模块：
 *  - lib/localize.ts   localizedName / localizedNameSchema（多语言名称解析）
 *  - lib/nav.ts        buildNavGroupsFromMenus（数据驱动导航构建）
 *  - lib/datetime.ts   getWeekdayShortNames / getWeekdayShortNamesSundayFirst（星期序列）
 *  - lib/chart-colors.ts  BAR_COLORS（报表图表配色常量）
 *  - lib/pagination.ts / pagination-util.ts  validatePageSize / buildPageHref
 *
 * 运行：npx tsx --test test/unit-pure-fns.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { localizedName, localizedNameSchema } from "../lib/localize";
import { buildNavGroupsFromMenus, type MenuRow, type MenuGroupRow } from "../lib/nav";
import {
  getWeekdayShortNames,
  getWeekdayShortNamesSundayFirst,
  getMonthShortNames,
} from "../lib/datetime";
import { BAR_COLORS } from "../lib/chart-colors";
import { buildPageHref } from "../lib/pagination-util";
import { validatePageSize } from "../lib/pagination";

/* ==================== 1. localize: 多语言名称解析 ==================== */

test("localize: JSON 字符串与对象入参均可解析，locale 优先于默认语言", () => {
  const json = '{"zh-CN":"记账","en":"Bookkeeping"}';
  assert.strictEqual(localizedName(json, "en"), "Bookkeeping");
  assert.strictEqual(localizedName(json, "zh-CN"), "记账");
  // 未命中 locale 时回退默认语言 zh-CN
  assert.strictEqual(localizedName(json, "zh-TW"), "记账");
  // 已解析对象入参
  assert.strictEqual(localizedName({ "zh-CN": "📒", en: "Notebook" }, "en"), "Notebook");
  // 仅含默认语言时任意 locale 均回退
  assert.strictEqual(localizedName('{"zh-CN":"记账"}', "en"), "记账");
});

test("localize: 非法/空入参返回空串（交由调用方回退 t(key)）", () => {
  assert.strictEqual(localizedName("not-json", "zh-CN"), "");
  assert.strictEqual(localizedName("", "zh-CN"), "");
  assert.strictEqual(localizedName(null, "zh-CN"), "");
  assert.strictEqual(localizedName(undefined, "zh-CN"), "");
  assert.strictEqual(localizedName("42", "zh-CN"), "");
});

test("localize: schema 要求默认语言必填（common.nameRequired）且单值 ≤50 字", () => {
  // 合法：默认语言 zh-CN 有值
  assert.ok(localizedNameSchema.safeParse({ "zh-CN": "记账" }).success);
  // 50 字边界通过
  assert.ok(localizedNameSchema.safeParse({ "zh-CN": "a".repeat(50) }).success);
  // 缺默认语言 → 拒绝
  const missing = localizedNameSchema.safeParse({ en: "Bookkeeping" });
  assert.ok(!missing.success);
  assert.ok(String(missing.error?.issues?.[0]?.message).includes("nameRequired"));
  // 默认语言为空串 → 拒绝
  assert.ok(!localizedNameSchema.safeParse({ "zh-CN": "  " }).success);
  // 值超 50 → 拒绝
  assert.ok(!localizedNameSchema.safeParse({ "zh-CN": "a".repeat(51) }).success);
});

/* ==================== 2. nav: 数据驱动导航构建 ==================== */

const M_DASH: MenuRow = {
  menuId: "nav.dash", name: '{"zh-CN":"首页","en":"Dashboard"}', icon: "🏠",
  menuGroupId: "book", sort: 1, statusCode: "active", deviceType: "desktop", link: "/dashboard", remark: null,
};
const M_ADD: MenuRow = {
  menuId: "nav.add", name: '{"zh-CN":"记一笔","en":"Add"}', icon: "➕",
  menuGroupId: "book", sort: 2, statusCode: "active", deviceType: "mobile", link: "/transactions/new", remark: null,
};
const M_SETTINGS: MenuRow = {
  menuId: "nav.settings", name: '{"zh-CN":"设置","en":"Settings"}', icon: "⚙️",
  menuGroupId: "manage", sort: 1, statusCode: "active", deviceType: "desktop", link: "/settings", remark: null,
};
const M_DISABLED: MenuRow = {
  menuId: "nav.old", name: '{"zh-CN":"旧入口"}', icon: "🗑",
  menuGroupId: "book", sort: 9, statusCode: "disabled", deviceType: "desktop", link: "/old", remark: null,
};
const GROUPS: MenuGroupRow[] = [
  { menuGroupId: "manage", name: '{"zh-CN":"管理"}', sort: 1, remark: null },
  { menuGroupId: "book", name: '{"zh-CN":"记账"}', sort: 0, remark: null },
];

test("nav: disabled 菜单被过滤、/settings 对非 admin 隐藏、mobile 仅桌面外显 mobile 项", () => {
  const all = [M_DASH, M_ADD, M_SETTINGS, M_DISABLED];
  // 桌面端 admin：能看到全部激活项（含 settings）
  const desktopAdmin = buildNavGroupsFromMenus(all, null, "admin", "desktop", "zh-CN");
  const keysAdm = desktopAdmin.flatMap((g) => g.items.map((i) => i.key)).sort();
  assert.deepEqual(keysAdm, ["nav.add", "nav.dash", "nav.settings"]);
  // 桌面端普通用户：settings 被隐藏，disabled 也被过滤
  const desktopUser = buildNavGroupsFromMenus(all, null, "user", "desktop", "zh-CN");
  const keysUser = desktopUser.flatMap((g) => g.items.map((i) => i.key)).sort();
  assert.deepEqual(keysUser, ["nav.add", "nav.dash"]);
  // 移动端：仅保留 deviceType=mobile 的项
  const mobile = buildNavGroupsFromMenus(all, null, "admin", "mobile", "zh-CN");
  const mobileItems = mobile.flatMap((g) => g.items);
  assert.deepEqual(mobileItems.map((i) => i.key), ["nav.add"]);
  assert.ok(mobileItems.every((i) => i.deviceType === "mobile"));
});

test("nav: enabledIds 子集启用；无匹配时按分组过滤", () => {
  const all = [M_DASH, M_ADD, M_SETTINGS];
  const groups = buildNavGroupsFromMenus(all, ["nav.dash"], "user", "desktop", "zh-CN");
  const items = groups.flatMap((g) => g.items);
  assert.deepEqual(items.map((i) => i.key), ["nav.dash"]);
});

test("nav: 分组顺序按 menu_groups.sort（0 先）", () => {
  const all = [M_DASH, M_ADD, M_SETTINGS, M_DISABLED];
  const groups = buildNavGroupsFromMenus(all, null, "admin", "desktop", "zh-CN", GROUPS);
  assert.deepEqual(groups.map((g) => g.group), ["book", "manage"]);
  // 分组名按 locale 解析：zh-CN 取「记账」
  assert.strictEqual(groups[0].name, "记账");
  // 项内名称按 locale
  const dash = groups[0].items.find((i) => i.key === "nav.dash");
  assert.strictEqual(dash!.name, "首页");
});

test("nav: locale=en 时展示名解析为英文", () => {
  const groups = buildNavGroupsFromMenus([M_DASH], null, "user", "desktop", "en", GROUPS);
  assert.strictEqual(groups[0].items[0].name, "Dashboard");
});

test("nav: 无任何可见项时返回空数组（不抛错）", () => {
  assert.deepEqual(buildNavGroupsFromMenus([], null, "user", "desktop", "zh-CN"), []);
  assert.deepEqual(buildNavGroupsFromMenus([M_DISABLED], null, "user", "desktop", "zh-CN"), []);
});

/* ==================== 3. datetime: 星期/月份命名 ==================== */

test("datetime: 周一为首的短星期名（zh-CN 周一开头 / en Mon 开头）", () => {
  const zh = getWeekdayShortNames("zh-CN");
  assert.strictEqual(zh.length, 7);
  assert.match(zh[0], /^周一/);
  const en = getWeekdayShortNames("en");
  assert.strictEqual(en[0], "Mon");
  assert.strictEqual(en[6], "Sun");
  const tw = getWeekdayShortNames("zh-TW");
  assert.strictEqual(tw.length, 7);
  assert.match(tw[0], /^週一/);
});

test("datetime: 周日为首的短星期名（日一二…）", () => {
  const zh = getWeekdayShortNamesSundayFirst("zh-CN");
  assert.strictEqual(zh.length, 7);
  assert.match(zh[0], /^周日/);
  const en = getWeekdayShortNamesSundayFirst("en");
  assert.strictEqual(en[0], "Sun");
  assert.strictEqual(en[6], "Sat");
});

test("datetime: 短月名 12 项齐全（en 英文缩写 / zh-CN 带月后缀）", () => {
  const en = getMonthShortNames("en");
  assert.strictEqual(en.length, 12);
  assert.strictEqual(en[0], "Jan");
  assert.strictEqual(en[11], "Dec");
  const zh = getMonthShortNames("zh-CN");
  assert.strictEqual(zh.length, 12);
  for (const m of zh) assert.match(m, /月$/u);
  const tw = getMonthShortNames("zh-TW");
  assert.strictEqual(tw.length, 12);
  for (const m of tw) assert.match(m, /月$/u);
});

/* ==================== 4. chart-colors: 报表配色 ==================== */

test("chart-colors: BAR_COLORS 提供 ≥12 个合法十六进制色，供循环取色", () => {
  assert.ok(BAR_COLORS.length >= 12);
  assert.strictEqual(new Set(BAR_COLORS).size, BAR_COLORS.length, "颜色应不重复");
  for (const c of BAR_COLORS) assert.match(c, /^#[0-9a-f]{6}$/i);
});

/* ==================== 5. pagination: 页面尺寸校验与 href 构建 ==================== */

test("分页: validatePageSize 仅放行允许值，否则回退 allowed[0]", () => {
  assert.strictEqual(validatePageSize(20, [10, 20, 50, 100]), 20);
  assert.strictEqual(validatePageSize(50, [10, 20, 50, 100]), 50);
  assert.strictEqual(validatePageSize(15, [10, 20, 50, 100]), 10);
  assert.strictEqual(validatePageSize(0, [10, 20]), 10);
  assert.strictEqual(validatePageSize(-5, [10, 20]), 10);
});

test("分页: buildPageHref 保留非空查询参数并追加 page，空值省略", () => {
  assert.strictEqual(
    buildPageHref("/investments/stocks", { type: "stock", pageSize: 20, foo: undefined, bar: "", baz: null }, 3),
    "/investments/stocks?type=stock&pageSize=20&page=3",
  );
  assert.strictEqual(buildPageHref("/x", {}, 1), "/x?page=1");
  assert.strictEqual(buildPageHref("/y", { q: "a b" }, 2), "/y?q=a+b&page=2");
});
