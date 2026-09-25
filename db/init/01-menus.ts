/**
 * 菜单分组 + 菜单项 定义数据（seed 专用）/ Menu groups + items (seed-only)
 * name 字段存 JSON 字符串，格式与 DB schema 一致。/ The name field stores a JSON string, same format as the DB schema.
 */
import { type MenuStatusCode, type MenuDeviceType, DEFAULT_LEDGER_ICON, STATUS, SETTINGS_PATH } from "../../lib/constants";
import { db } from "../../lib/db";
import { menuGroups, menus } from "../../db/schema";

export type MenuGroupDef = {
  menuGroupId: string;
  name: string;
  sort: number;
  remark: string;
};

export type MenuDef = {
  menuId: string;
  name: string;
  icon: string;
  menuGroupId: string;
  sort: number;
  statusCode: MenuStatusCode;
  deviceType: MenuDeviceType;
  link: string;
  remark: string;
};

/** 菜单分组（4 组：记账 / 投资 / 保障 / 管理）/ Menu groups (4: bookkeeping / invest / protection / manage) */
export const MENU_GROUP_DEFS: MenuGroupDef[] = [
  { menuGroupId: "book",     name: JSON.stringify({ "zh-CN": "记账", en: "Bookkeeping", "zh-TW": "記帳" }),       sort: 1, remark: "日常记账" },
  { menuGroupId: "invest",   name: JSON.stringify({ "zh-CN": "投资", en: "Invest", "zh-TW": "投資" }),             sort: 2, remark: "投资管理" },
  { menuGroupId: "protection", name: JSON.stringify({ "zh-CN": "保障", en: "Protection", "zh-TW": "保障" }),       sort: 3, remark: "保险与养老保障" },
  { menuGroupId: "manage",   name: JSON.stringify({ "zh-CN": "管理", en: "Manage", "zh-TW": "管理" }),             sort: 4, remark: "账本与系统管理" },
];

/** 菜单项（26 项）/ Menu items (26) */
export const MENU_DEFS: MenuDef[] = [
  /* 记账 group · 7 / Bookkeeping group · 7 */
  { menuId: "nav.add",               name: JSON.stringify({ "zh-CN": "记一笔",    en: "Add",               "zh-TW": "記一筆" }), icon: "⚡", menuGroupId: "book",     sort: 1, statusCode: STATUS.active, deviceType: "mobile",   link: "/add",            remark: "快速记账" },
  { menuId: "nav.dashboard",         name: JSON.stringify({ "zh-CN": "仪表盘",    en: "Dashboard",          "zh-TW": "儀表板" }), icon: "🎯", menuGroupId: "book",     sort: 2, statusCode: STATUS.active, deviceType: "mobile",   link: "/dashboard",      remark: "" },
  { menuId: "nav.transactions",      name: JSON.stringify({ "zh-CN": "流水",      en: "Transactions",       "zh-TW": "流水" }), icon: "🧾", menuGroupId: "book",     sort: 3, statusCode: STATUS.active, deviceType: "mobile",   link: "/transactions",   remark: "" },
  { menuId: "nav.calendar",          name: JSON.stringify({ "zh-CN": "收支日历",  en: "Calendar",           "zh-TW": "收支日曆" }), icon: "📅", menuGroupId: "book",     sort: 4, statusCode: STATUS.active, deviceType: "desktop",  link: "/calendar",       remark: "" },
  { menuId: "nav.accounts",          name: JSON.stringify({ "zh-CN": "账户",      en: "Accounts",            "zh-TW": "帳戶" }), icon: "💳", menuGroupId: "book",     sort: 5, statusCode: STATUS.active, deviceType: "desktop",  link: "/accounts",       remark: "" },
  { menuId: "nav.balance",           name: JSON.stringify({ "zh-CN": "余额表",    en: "Balance Sheet",      "zh-TW": "餘額表" }), icon: "⚖️", menuGroupId: "book",     sort: 6, statusCode: STATUS.active, deviceType: "desktop",  link: "/balance",        remark: "" },
  { menuId: "nav.reports",           name: JSON.stringify({ "zh-CN": "报表",      en: "Reports",            "zh-TW": "報表" }), icon: "🌟", menuGroupId: "book",     sort: 7, statusCode: STATUS.active, deviceType: "mobile",   link: "/reports",        remark: "" },
  /* 投资 group · 10 / Invest group · 10 */
  { menuId: "nav.investOverview",    name: JSON.stringify({ "zh-CN": "投资总览",  en: "Investment Overview",  "zh-TW": "投資總覽" }), icon: "📊", menuGroupId: "invest",   sort: 1, statusCode: STATUS.active, deviceType: "desktop", link: "/investments",     remark: "" },
  { menuId: "nav.investStocks",      name: JSON.stringify({ "zh-CN": "股票管理",  en: "Stocks",               "zh-TW": "股票管理" }), icon: "📈", menuGroupId: "invest",   sort: 2, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/stocks", remark: "" },
  { menuId: "nav.investDigitalAssets", name: JSON.stringify({ "zh-CN": "数字资产管理", en: "Digital Assets",   "zh-TW": "數位資產管理" }), icon: "₿",  menuGroupId: "invest",   sort: 3, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/digital-assets", remark: "" },
  { menuId: "nav.investFunds",       name: JSON.stringify({ "zh-CN": "基金管理",  en: "Funds",                "zh-TW": "基金管理" }), icon: "📉", menuGroupId: "invest",   sort: 4, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/funds", remark: "" },
  { menuId: "nav.investCollectibles", name: JSON.stringify({ "zh-CN": "收藏品管理", en: "Collectibles",         "zh-TW": "收藏品管理" }), icon: "🖼️", menuGroupId: "invest",   sort: 5, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/collectibles", remark: "" },
  { menuId: "nav.investDeposits",    name: JSON.stringify({ "zh-CN": "定期管理",  en: "Time Deposits",        "zh-TW": "定期管理" }), icon: "🏦", menuGroupId: "invest",   sort: 6, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/deposits", remark: "" },
  { menuId: "nav.investBonds",       name: JSON.stringify({ "zh-CN": "国债管理",  en: "Bonds",                "zh-TW": "國債管理" }), icon: "📜", menuGroupId: "invest",   sort: 7, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/bonds", remark: "" },
  { menuId: "nav.investMetals",      name: JSON.stringify({ "zh-CN": "贵金属管理", en: "Precious Metals",      "zh-TW": "貴金屬管理" }), icon: "🥇", menuGroupId: "invest",   sort: 8, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/metals", remark: "" },
  { menuId: "nav.investRealEstate",  name: JSON.stringify({ "zh-CN": "不动产管理", en: "Real Estate",          "zh-TW": "不動產管理" }), icon: "🏠", menuGroupId: "invest",   sort: 9, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/real-estate", remark: "" },
  { menuId: "nav.investLoans",       name: JSON.stringify({ "zh-CN": "借贷管理",  en: "Loans",                "zh-TW": "借貸管理" }), icon: "🤝", menuGroupId: "invest",   sort: 10, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/loans", remark: "" },
  /* 保障 group · 2 / Protection group · 2 */
  { menuId: "nav.protectionOverview", name: JSON.stringify({ "zh-CN": "保障总览", en: "Protection Overview", "zh-TW": "保障總覽" }), icon: "🛡️", menuGroupId: "protection", sort: 1, statusCode: STATUS.active, deviceType: "desktop", link: "/protection",   remark: "" },
  { menuId: "nav.investInsurance",   name: JSON.stringify({ "zh-CN": "储蓄型保险", en: "Savings Insurance",   "zh-TW": "儲蓄型保險" }), icon: "☂️", menuGroupId: "protection", sort: 2, statusCode: STATUS.active, deviceType: "desktop", link: "/investments/insurance", remark: "" },
  /* 管理 group · 7 / Manage group · 7 */
  { menuId: "nav.ledgers",    name: JSON.stringify({ "zh-CN": "账本管理", en: "Ledgers",       "zh-TW": "帳本管理" }), icon: DEFAULT_LEDGER_ICON, menuGroupId: "manage",  sort: 1, statusCode: STATUS.active, deviceType: "desktop", link: "/ledgers",  remark: "仅管理员可见" },
  { menuId: "nav.projects",   name: JSON.stringify({ "zh-CN": "项目管理", en: "Projects",      "zh-TW": "專案管理" }), icon: "📁", menuGroupId: "manage",  sort: 2, statusCode: STATUS.active, deviceType: "desktop", link: "/projects", remark: "" },
  { menuId: "nav.recurring",  name: JSON.stringify({ "zh-CN": "周期计划", en: "Recurring",     "zh-TW": "週期計劃" }), icon: "🔁", menuGroupId: "manage",  sort: 3, statusCode: STATUS.active, deviceType: "desktop", link: "/recurring", remark: "" },
  { menuId: "nav.categories", name: JSON.stringify({ "zh-CN": "分类管理", en: "Categories",    "zh-TW": "分類管理" }), icon: "📂", menuGroupId: "manage",  sort: 4, statusCode: STATUS.active, deviceType: "desktop", link: "/categories", remark: "" },
  { menuId: "nav.tags",       name: JSON.stringify({ "zh-CN": "标签管理", en: "Tags",          "zh-TW": "標籤管理" }), icon: "🏷️", menuGroupId: "manage",  sort: 5, statusCode: STATUS.active, deviceType: "desktop", link: "/tags",     remark: "" },
  { menuId: "nav.settings",   name: JSON.stringify({ "zh-CN": "全局设置", en: "Settings",      "zh-TW": "全域設定" }), icon: "⚙️", menuGroupId: "manage",  sort: 6, statusCode: STATUS.active, deviceType: "desktop", link: SETTINGS_PATH, remark: "仅管理员可见" },
  { menuId: "nav.profile",    name: JSON.stringify({ "zh-CN": "我的",    en: "Profile",         "zh-TW": "我的" }), icon: "🍀", menuGroupId: "manage",  sort: 7, statusCode: STATUS.active, deviceType: "mobile",  link: "/profile",  remark: "" },
];

/** 所有 active 状态的 menuId 列表，供 userMenuConfig 初始化使用 / All active menuIds, used to initialize userMenuConfig */
export const ACTIVE_MENU_IDS = MENU_DEFS.filter((m) => m.statusCode === STATUS.active).map((m) => m.menuId);

/**
 * 幂等写入菜单分组 + 菜单目录（仅全局目录，不含账本相关的 userMenuConfig）。
 * Idempotently seed menu groups + catalog (global only; no ledger-scoped userMenuConfig).
 * 在 db:push 之后由 db/init/index.ts 自动调用 / Auto-invoked by db/init/index.ts after db:push.
 */
export async function run(): Promise<void> {
  console.log("🔧 init · 菜单分组与菜单目录（幂等）/ menu groups & catalog (idempotent)");
  for (const g of MENU_GROUP_DEFS) {
    await db.insert(menuGroups).values(g).onConflictDoNothing();
  }
  for (const m of MENU_DEFS) {
    await db.insert(menus).values(m).onConflictDoNothing();
  }
  console.log(`   ✅ 菜单分组 ${MENU_GROUP_DEFS.length} 项、菜单 ${MENU_DEFS.length} 项`);
}
