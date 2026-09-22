/**
 * ratcount · 全局常量与枚举（与数据库无关的纯 TS 真源）
 *
 * 将原先散落在 db/schema.ts 顶部的「枚举值数组 + 对象式访问常量 + 派生类型」
 * 集中到此处，便于跨层（lib / app / db seed）统一引用，避免与表定义耦合。
 *
 * 设计口径：
 *  - 每个枚举先声明值数组 `xxx = [...] as const`
 *  - 再派生联合类型 `type Xxx = (typeof xxx)[number]`
 *  - 最后生成对象式常量 `XXX = Object.fromEntries(...)`，运行时可写 `ROLE.admin === user.role`
 *
 * db/schema.ts 通过 `import { ... } from "@/lib/constants"` 取用，并 `export *` 透出，
 * 因此既有的 `from "@/db/schema"` 导入无需改动。
 * ratcount · global constants & enums (pure-TS single source, DB-agnostic)
 *
 * Moves the "enum-value arrays + object-style access constants + derived types" that used to sit at the
 * top of db/schema.ts into one place, so lib / app / db seed can share them without coupling to table defs.
 *
 * Design convention:
 *  - Declare a value array `xxx = [...] as const` first
 *  - Then derive a union type `type Xxx = (typeof xxx)[number]`
 *  - Finally build an object-style constant `XXX = Object.fromEntries(...)`, so at runtime `ROLE.admin === user.role`
 *
 * db/schema.ts imports from "@/lib/constants" and re-exports via `export *`,
 * so existing `from "@/db/schema"` imports need no change.
 */

/** 将 snake_case 转为 camelCase，供对象式常量键名使用 / Convert snake_case to camelCase, for object-style constant keys */
export const snakeToCamel = (s: string): string =>
  s.replace(/_([a-z])/g, (_, c) => c.toUpperCase() as string);

/* ===== 通用布尔与默认值常量 / Common boolean & default-value constants ===== */

/** 布尔常量（SQLite 以 0/1 存储，Drizzle boolean 模式自动转换）/ Boolean constants (SQLite stores 0/1; Drizzle boolean mode converts automatically) */
export const TRUE = true;
export const FALSE = false;

/** 默认基准币种代码（账本基准币种 / 账户币种默认值）/ Default base currency code (ledger base / account default currency) */
export const DEFAULT_CURRENCY = "CNY";
/** 账本默认图标 / Default ledger icon */
export const DEFAULT_LEDGER_ICON = "📒";

/** 全局设置用户 ID（settings.userId = 'global' 表示全局项，其他为用户级）/ Global settings user id ('global' means a global row; others are per-user) */
export const GLOBAL_USER_ID = "global";

/** 默认语言（项目唯一真源；i18n/routing.ts 的 DEFAULT_LOCALE 由此派生，languages 表 is_default 字段的兜底值）/ Default language (single source; i18n/routing.ts's DEFAULT_LOCALE derives from this, and it's the fallback for languages.is_default) */
export const DEFAULT_LANGUAGE = "zh-CN";

/**
 * 语言 cookie 名（与 i18n/routing.ts 的 localeCookie.name 保持一致；next-intl 该
 * 字段类型为 boolean | CookieAttributes，直接字面量避免类型收敛问题）
 * Locale cookie name (must match localeCookie.name in i18n/routing.ts; next-intl types that field as
 * boolean | CookieAttributes, so a literal avoids type-narrowing issues)
 */
export const LOCALE_COOKIE_NAME = "money_locale";

/** 当前账本 cookie 名（客户端记忆选中账本，服务端 getCurrentLedger 读取；与 lib/ledger.ts 共用）/ Current-ledger cookie name (client remembers selection; server reads it in getCurrentLedger; shared with lib/ledger.ts) */
export const LEDGER_COOKIE = "money_ledger";

/** 图形验证码 cookie 名（答案签名 JWT 存 httpOnly cookie；与 lib/auth/captcha.ts 共用）/ Captcha cookie name (answer-signed JWT lives in an httpOnly cookie; shared with lib/auth/captcha.ts) */
export const CAPTCHA_COOKIE = "money_captcha";

/** 时区 cookie 名（与 money_locale 同风格；与 i18n/timezones.ts、lib/settings.ts 共用）/ Timezone cookie name (same style as money_locale; shared with i18n/timezones.ts and lib/settings.ts) */
export const TIME_ZONE_COOKIE = "money_timezone";

/** 风格 cookie 名（本机风格偏好；由「个人中心 → 风格设置」写入，根布局服务端直接渲染 <html class>）/ Theme cookie name (local style pref; written by "Profile → Theme", root layout renders <html class> server-side) */
export const THEME_COOKIE = "money_theme";

/** 登录页路径（Auth.js pages.signIn / 未登录 redirect 等共用的唯一真源）/ Login page path (single source for Auth.js pages.signIn / not-signed-in redirects) */
export const LOGIN_PATH = "/login";

/** 仪表盘路径（登录成功 / 无权限 redirect 等共用的唯一真源）/ Dashboard path (single source for post-login / no-permission redirects) */
export const DASHBOARD_PATH = "/dashboard";

/** 全局设置页路径（设置写操作后 revalidatePath 等共用的唯一真源）/ Settings page path (single source for revalidatePath after settings writes) */
export const SETTINGS_PATH = "/settings";

/** 设置子页路径（导航 / revalidatePath / basePath / router.push 等共用的唯一真源）/ Settings sub-page paths (single source for nav / revalidatePath / basePath / router.push) */
export const SETTINGS_CURRENCIES_PATH = "/settings/currencies";
export const SETTINGS_LANGUAGES_PATH = "/settings/languages";
export const SETTINGS_MENUS_PATH = "/settings/menus";
export const SETTINGS_MENU_GROUPS_PATH = "/settings/menu-groups";
export const SETTINGS_LOGS_PATH = "/settings/logs";
export const SETTINGS_USERS_PATH = "/settings/users";

/** 审计日志默认保留天数（设置项 audit_log_retention_days 未配置/非法时的兜底）/ Default audit-log retention (fallback when audit_log_retention_days is unset/invalid) */
export const DEFAULT_AUDIT_RETENTION_DAYS = 90;

/** 一天的毫秒数（保留天数 → 截止时间戳计算共用）/ Milliseconds per day (shared by retention-days → cutoff-timestamp math) */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ===== 预设颜色（颜色选择器 / 图表循环取色共用唯一真源）/ Preset colors (shared source for picker & chart cycling) ===== */

/** 预设常用颜色列表（40 色，按色系分组）；颜色选择器预设面板与图表循环取色共用 / Preset color list (40 colors, grouped by hue); shared by the picker panel and chart color cycling */
export const COLORS = [
  // 红色系 / Reds
  "#ef4444", "#f87171", "#fca5a5", "#dc2626",
  // 橙色系 / Oranges
  "#f97316", "#fb923c", "#fdba74", "#ea580c",
  // 黄色系 / Yellows
  "#f59e0b", "#fbbf24", "#fcd34d", "#d97706",
  // 绿色系 / Greens
  "#22c55e", "#4ade80", "#86efac", "#16a34a",
  // 青色系 / Teals
  "#14b8a6", "#2dd4bf", "#5eead4", "#0d9488",
  // 蓝色系 / Blues
  "#3b82f6", "#60a5fa", "#93c5fd", "#2563eb",
  // 靛色系 / Indigos
  "#6366f1", "#818cf8", "#a5b4fc", "#4f46e5",
  // 紫色系 / Purples
  "#8b5cf6", "#a78bfa", "#c4b5fd", "#7c3aed",
  // 粉色系 / Pinks
  "#ec4899", "#f472b6", "#f9a8d4", "#db2777",
  // 灰色系 / Grays
  "#64748b", "#94a3b8", "#475569", "#334155",
  // 环形图高区分度色（分类占比等循环取色，与上方色系独立增强区分度）/ High-contrast ring colors (category share etc.; independent from the palettes above)
  "#eab308", "#f43f5e", "#84cc16", "#06b6d4",
];

/* ===== 统计时间段（年/月粒度）/ Stats period (year/month granularity) ===== */

/** 统计时间段类型：year=年 / month=月 / Stats period types: year / month */
export const statsPeriodTypes = ["year", "month"] as const;
export type StatsPeriodType = (typeof statsPeriodTypes)[number];

/** 统计时间范围：年或月粒度（period.ts / queries 共用的类型唯一真源）/ Stats period range: year or month (single source type for period.ts / queries) */
export type StatsPeriod = { type: StatsPeriodType; year: number; month?: number };

/** 统计时间段类型常量（对象式访问，运行时可比 `STATS_PERIOD.year` === period.type）/ Stats period type constants (object-style; at runtime `STATS_PERIOD.year` === period.type) */
export const STATS_PERIOD = Object.fromEntries(statsPeriodTypes.map((t) => [t, t])) as { [K in StatsPeriodType]: K };

/* ===== 用户 / 成员角色 / User & member roles ===== */

/** 用户角色：admin=管理员（首个注册用户自动成为），user=普通用户 / User roles: admin (first registrant auto-becomes), user (regular) */
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

/** 用户角色值常量（由 userRoles 派生，对象式访问，运行时可比 `ROLE.admin` === user.role）/ User role value constants (derived from userRoles; at runtime `ROLE.admin` === user.role) */
export const ROLE = Object.fromEntries(userRoles.map((r) => [r, r])) as { [K in UserRole]: K };

/** 账本成员角色 / Ledger member roles */
export const memberRoles = ["owner", "editor", "viewer"] as const;
export type MemberRole = (typeof memberRoles)[number];

/** 账本成员角色值常量（由 memberRoles 派生，对象式访问，运行时可比 `MR.owner` === member.role）/ Ledger member role value constants (derived from memberRoles; at runtime `MR.owner` === member.role) */
export const MR = Object.fromEntries(memberRoles.map((r) => [r, r])) as { [K in MemberRole]: K };

/* ===== 账户类型 / Account types ===== */

/**
 * 账户类型（19 种）：cash 现金 / debit_card 储蓄卡 / credit_card 信用账户 /
 *  wechat 虚拟账户 / savings 定期 / investment 股票 / fund 基金 /
 *  precious_metal 贵金属 / bond 国债 / foreign_currency 外币账户 /
 *  real_estate 不动产 / insurance 储蓄型保险 / housing_fund 公积金 /
 *  national_pension 国家养老金 / personal_pension 个人养老金 /
 *  loan 民间借贷 /
 *  digital_asset 数字资产 / collectible 收藏品 / custom 自定义
 *  （custom 恒为兜底项，保持最后）
 * Account types (19): cash / debit_card / credit_card / wechat /
 *  savings (time deposit) / investment (stock) / fund /
 *  precious_metal / bond / foreign_currency /
 *  real_estate / insurance / housing_fund /
 *  national_pension / personal_pension /
 *  loan (private lending) /
 *  digital_asset / collectible / custom (user-defined)
 *  (custom is always the fallback and stays last)
 */
export const accountTypes = [
  "cash", "debit_card", "credit_card", "wechat", "savings",
  "investment", "fund", "precious_metal", "bond", "foreign_currency",
  "real_estate", "insurance", "housing_fund", "national_pension", "personal_pension",
  "loan", "digital_asset", "collectible",
  "custom",
] as const;
export type AccountType = (typeof accountTypes)[number];

/** 账户类型值常量（对象式访问，运行时可比 `ACCT.cash` === account.type）/ Account type value constants (object-style; at runtime `ACCT.cash` === account.type) */
export const ACCT = Object.fromEntries(accountTypes.map((t) => [t, t])) as { [K in AccountType]: K };

/** 保障类账户（/protection 汇总页与单测共用的唯一真源）/ Protection account types (single source for /protection summary & unit tests) */
export const PROTECTION_ACCOUNT_TYPES = [
  ACCT.insurance, ACCT.housing_fund, ACCT.national_pension, ACCT.personal_pension,
] as const satisfies readonly AccountType[];

/* ===== 账户类型选项 / 图标 / 展示 / Account type options / icons / display ===== */

/**
 * 账户类型集中定义（单一数据源，多处复用）
 *  - ACCT：常量式入口（ACCT.cash / ACCT.credit_card / …），satisfies 保证与 db/schema 的 accountTypes 编译期互锁
 *  - ACCOUNT_TYPES：类型选项（value + i18n key），供表单下拉 / 列表分组复用
 *  - TYPE_ICON：类型 → 图标，satisfies 强制 19 项齐全（此前 Record<string,string> 漏删无感知）
 *  - ACCOUNT_TYPE_I18N_KEY：类型 → i18n key（由 ACCOUNT_TYPES 派生，避免 snake/camel 映射重复）
 *  - INVESTMENT_ACCOUNT_TYPES：投资类账户（支出时不可选为出账账户）
 * Account type definitions (single data source, reused in many places)
 *  - ACCT: constant entry (ACCT.cash / ACCT.credit_card / …); satisfies locks it to db/schema's accountTypes at compile time
 *  - ACCOUNT_TYPES: type options (value + i18n key) for form dropdowns / list grouping
 *  - TYPE_ICON: type → icon; satisfies forces all 19 present (previously Record<string,string> hid missing ones silently)
 *  - ACCOUNT_TYPE_I18N_KEY: type → i18n key (derived from ACCOUNT_TYPES to avoid duplicate snake/camel mapping)
 *  - INVESTMENT_ACCOUNT_TYPES: investment accounts (not selectable as the source account on an expense)
 */
/** 账户类型选项（值 + i18n key），顺序同 accountTypes / Account type options (value + i18n key), same order as accountTypes */
export const ACCOUNT_TYPES = [
  { v: ACCT.cash, key: "acctType.cash" },
  { v: ACCT.debit_card, key: "acctType.debitCard" },
  { v: ACCT.credit_card, key: "acctType.creditCard" },
  { v: ACCT.wechat, key: "acctType.wechat" },
  { v: ACCT.savings, key: "acctType.savings" },
  { v: ACCT.investment, key: "acctType.investment" },
  { v: ACCT.fund, key: "acctType.fund" },
  { v: ACCT.precious_metal, key: "acctType.preciousMetal" },
  { v: ACCT.bond, key: "acctType.bond" },
  { v: ACCT.foreign_currency, key: "acctType.foreignCurrency" },
  { v: ACCT.real_estate, key: "acctType.realEstate" },
  { v: ACCT.insurance, key: "acctType.insurance" },
  { v: ACCT.housing_fund, key: "acctType.housingFund" },
  { v: ACCT.national_pension, key: "acctType.nationalPension" },
  { v: ACCT.personal_pension, key: "acctType.personalPension" },
  { v: ACCT.loan, key: "acctType.loan" },
  { v: ACCT.digital_asset, key: "acctType.digitalAsset" },
  { v: ACCT.collectible, key: "acctType.collectible" },
  { v: ACCT.custom, key: "acctType.custom" },
] as const satisfies readonly { v: AccountType; key: string }[];

/** 账户类型 → 图标；satisfies 强制 19 项齐全，漏图标 TS 立即报错 / Account type → icon; satisfies forces all 19 present, a missing icon fails TS immediately */
export const TYPE_ICON = {
  cash: "💵", debit_card: "💳", credit_card: "💳", wechat: "💬",
  savings: "🏦", investment: "📈", fund: "📊", precious_metal: "🥇",
  bond: "📜", foreign_currency: "💱", real_estate: "🏠",
  insurance: "☂️", housing_fund: "🏘️", national_pension: "💰", personal_pension: "💼",
  loan: "🤝", digital_asset: "₿", collectible: "🖼️",
  custom: "📦",
} as const satisfies Record<AccountType, string>;

/** 是否投资类账户：支出时不允许从这些账户出钱（string 入参，未知类型安全返回 false）/ Whether an investment account: expenses can't draw from these (string input; unknown type safely returns false) */
export function isInvestmentAccount(type: string): boolean {
  return (INVESTMENT_ACCOUNT_TYPES as readonly string[]).includes(type);
}

/** 账户类型 → i18n key（snake_case → acctType.*），由 ACCOUNT_TYPES 派生 / Account type → i18n key (snake_case → acctType.*), derived from ACCOUNT_TYPES */
export const ACCOUNT_TYPE_I18N_KEY: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.v, t.key]),
);

/** 取账户类型图标，未知类型回退 📦 / Get account type icon; falls back to 📦 for unknown types */
export function accountTypeIcon(type: string): string {
  return TYPE_ICON[type as AccountType] ?? "📦";
}

/** 取账户类型 i18n key，未知类型回退原值 / Get account type i18n key; falls back to the raw value for unknown types */
export function accountTypeI18nKey(type: string): string {
  return ACCOUNT_TYPE_I18N_KEY[type] ?? type;
}

/** 取账户类型在 d.acctType 下的 camelCase key（用于直接索引 d.acctType 对象，不含 acctType. 前缀）/ Get the camelCase key under d.acctType (for directly indexing the d.acctType object, without the acctType. prefix) */
export function accountTypeCamelKey(type: string): string {
  return accountTypeI18nKey(type).replace("acctType.", "") || type;
}

/** 投资类账户：支出时不允许从这些账户出钱（非日常消费账户）/ Investment accounts: expenses can't draw from these (non everyday-spending accounts) */
export const INVESTMENT_ACCOUNT_TYPES = [
  ACCT.savings, ACCT.investment, ACCT.fund, ACCT.precious_metal, ACCT.bond, ACCT.real_estate,
  ACCT.insurance, ACCT.housing_fund, ACCT.loan, ACCT.digital_asset, ACCT.collectible,
] as const satisfies readonly AccountType[];

/* ===== 交易类型 / 分类类型 / 审计动作 / Transaction types / category types / audit actions ===== */

/** 交易类型代码：income 收入 / expense 支出 / transfer 转账（不计收支）/ Transaction type codes: income / expense / transfer (transfer counts neither) */
export const transactionTypes = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

/** 交易类型值常量（对象式访问，由 transactionTypes 派生）/ Transaction type value constants (object-style; derived from transactionTypes) */
export const TX = Object.fromEntries(transactionTypes.map((t) => [t, t])) as { [K in TransactionType]: K };

/** 分类类型（交易类型的子集：仅收支、无转账）/ Category type (subset of transaction types: only income/expense, no transfer) */
export type CategoryType = (typeof TX)["income" | "expense"];

/** 审计动作值常量（对象式访问，运行时可比 `AUDIT_ACTION.create` === log.action）/ Audit action value constants (object-style; at runtime `AUDIT_ACTION.create` === log.action) */
export const AUDIT_ACTION = { create: "C", read: "R", update: "U", delete: "D" } as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
export const auditActions = Object.values(AUDIT_ACTION);

/* ===== 交易类型选项 / 解析 / 展示 / Transaction type options / parsing / display ===== */

/**
 * 交易类型集中定义（单一数据源，多处复用）
 *  - TX：常量式访问，satisfies 保证与 db/schema 的 transactionTypes 编译期互锁
 *  - TRANSACTION_TYPES：类型选项（值 + i18n key），供筛选下拉 / 列表分组复用
 *  - TRANSACTION_TYPE_I18N_KEY：类型 → i18n key（由 TRANSACTION_TYPES 派生）
 *  - parseTransactionType：运行时解析，用于 CSV 导入 / URL 参数等 string 边界
 * Transaction type definitions (single data source, reused in many places)
 *  - TX: constant access; satisfies locks it to db/schema's transactionTypes at compile time
 *  - TRANSACTION_TYPES: type options (value + i18n key) for filter dropdowns / list grouping
 *  - TRANSACTION_TYPE_I18N_KEY: type → i18n key (derived from TRANSACTION_TYPES)
 *  - parseTransactionType: runtime parsing for string boundaries like CSV import / URL params
 */

/** 交易类型选项（值 + i18n key），顺序同 transactionTypes / Transaction type options (value + i18n key), same order as transactionTypes */
export const TRANSACTION_TYPES = [
  { v: "income", key: "common.income" },
  { v: "expense", key: "common.expense" },
  { v: "transfer", key: "common.transfer" },
] as const satisfies readonly { v: TransactionType; key: string }[];

/** 交易类型 → i18n key（由 TRANSACTION_TYPES 派生，避免重复映射）/ Transaction type → i18n key (derived from TRANSACTION_TYPES to avoid duplicate mapping) */
export const TRANSACTION_TYPE_I18N_KEY: Record<string, string> = Object.fromEntries(
  TRANSACTION_TYPES.map((t) => [t.v, t.key]),
);

/** 取交易类型 i18n key，未知类型回退原值 / Get transaction type i18n key; falls back to the raw value for unknown types */
export function transactionTypeI18nKey(type: string): string {
  return TRANSACTION_TYPE_I18N_KEY[type] ?? type;
}

/**
 * 取交易类型显示文案（服务端组件用：整本字典按 i18n key 路径取值）
 *  - dict：getMessages() 返回的整本字典
 *  - 缺键回退类型值本身，UI 永不空白
 * Get the transaction type display label (for server components: look up the whole dict by i18n key path)
 *  - dict: the full dictionary returned by getMessages()
 *  - Missing key falls back to the type value itself, so the UI is never blank
 */
export function transactionTypeLabel(dict: unknown, type: string): string {
  const path = TRANSACTION_TYPE_I18N_KEY[type];
  if (!path) return type;
  const [ns, k] = path.split(".");
  const section = (dict as Record<string, Record<string, string>> | null)?.[ns];
  return section?.[k] ?? type;
}

/**
 * 运行时解析交易类型（string 边界：CSV 导入 / searchParams）
 *  - 合法返回对应类型，非法（如脏数据、拼写错误）返回 null，交由调用方决定兜底
 * Runtime parsing of transaction type (string boundary: CSV import / searchParams)
 *  - Valid → the corresponding type; invalid (dirty data, typo) → null, letting the caller decide the fallback
 */
export function parseTransactionType(v: unknown): TransactionType | null {
  return typeof v === "string" && (transactionTypes as readonly string[]).includes(v)
    ? (v as TransactionType)
    : null;
}

/** 是否转账：转账需 toAccountId，且不计收支（两账户一减一加）/ Whether a transfer: needs toAccountId and counts neither income nor expense (one account minus, one plus) */
export function isTransfer(type: TransactionType): boolean {
  return type === TX.transfer;
}

/* ===== 启用状态（用户 / 菜单共用同一口径）/ Enabled status (shared by user & menu) ===== */

/** 启用状态：active 启用 / disabled 禁用（用户状态与菜单状态共用同一口径）/ Status: active / disabled (shared by user status and menu status) */
export const statusCodes = ["active", "disabled"] as const;
export type StatusCode = (typeof statusCodes)[number];
export const STATUS = Object.fromEntries(
  statusCodes.map((s) => [s, s]),
) as { [K in StatusCode]: K };

/** 用户状态（复用启用状态口径）/ User status (reuses the enabled-status convention) */
export type UserStatus = StatusCode;
export const USER_STATUS = STATUS;

/** 菜单状态（与启用状态同口径：active 启用 / disabled 禁用）/ Menu status (same convention: active / disabled) */
export type MenuStatusCode = StatusCode;
export const MENU_STATUS = STATUS;
/** 兼容别名（菜单状态代码数组，供 z.enum 等使用）/ Compat alias (menu status code array, for z.enum etc.) */
export const menuStatusCodes = statusCodes;

/* ===== 系统设置键 / System setting keys ===== */

/** 系统设置键（全局设置项），更新时的合法键白名单 / System setting keys (global settings); the allow-list of valid keys on update */
export const SETTING_KEYS = [
  "app_name",
  "app_slogan",
  "default_locale",
  "allow_registration",
  "enable_login_captcha",
  "audit_log_retention_days",
  "copyright",
  "allowed_page_sizes",
  "default_page_size",
  "default_timezone",
  "default_theme",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
/** 系统设置键对象式访问（运行时可比 `SETTING_KEY.appName` === key）/ System setting key object-style access (at runtime `SETTING_KEY.appName` === key) */
export const SETTING_KEY = Object.fromEntries(
  SETTING_KEYS.map((k) => [snakeToCamel(k), k]),
) as Record<string, SettingKey>;

/* ===== 项目状态 / Project status ===== */

/** 项目状态：active 进行中 / completed 已完成 / archived 已归档 / Project status: active / completed / archived */
export const projectStatuses = ["active", "completed", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const PROJECT_STATUS = Object.fromEntries(
  projectStatuses.map((s) => [s, s]),
) as { [K in ProjectStatus]: K };

/* ===== 审计实体类型 / Audit entity types ===== */

export const entityTypes = [
  "transaction", "account", "investment", "category", "balance",
  "auth", "user", "user_menu", "menu", "menu_group", "tag", "ledger",
  "recurring_plan", "language", "setting", "currency", "project",
  "register", "import", "audit_log",
] as const;
export type EntityType = (typeof entityTypes)[number];

/** 审计日志对象类型值常量（对象式访问，运行时可比 `ENTITY.transaction` === log.entity）/ Audit-log entity type value constants (object-style; at runtime `ENTITY.transaction` === log.entity) */
export const ENTITY = Object.fromEntries(
  entityTypes.map((e) => [snakeToCamel(e), e] as const),
) as Record<string, EntityType>;

/* ===== 周期计划（频率 / 状态）/ Recurring plan (frequency / status) ===== */

export const recurringFrequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof recurringFrequencies)[number];

/** 周期频率值常量（对象式访问，运行时可比 `FREQ.monthly` === plan.frequency）/ Recurring frequency value constants (object-style; at runtime `FREQ.monthly` === plan.frequency) */
export const FREQ = Object.fromEntries(recurringFrequencies.map((r) => [r, r])) as { [K in RecurringFrequency]: K };

/** 周期计划状态：active 启用 / paused 暂停 / Recurring plan status: active / paused */
export const recurringStatuses = ["active", "paused"] as const;
export type RecurringStatus = (typeof recurringStatuses)[number];
export const RECURRING_STATUS = Object.fromEntries(
  recurringStatuses.map((s) => [s, s]),
) as { [K in RecurringStatus]: K };

/* ===== 投资（类型 / 子类型 / 持仓状态）/ Investments (types / subtypes / holding status) ===== */

export const investmentTypes = [
  "stock", "fund", "deposit", "bond", "metal", "real_estate",
  "digital_asset", "collectible", "insurance", "loan",
] as const;
export type InvestmentType = (typeof investmentTypes)[number];
export const metalSubTypes = ["gold", "silver"] as const;
export type MetalSubType = (typeof metalSubTypes)[number];

/** 投资类型值常量（对象式访问，运行时可比 `INV.stock` === holding.type）/ Investment type value constants (object-style; at runtime `INV.stock` === holding.type) */
export const INV = Object.fromEntries(investmentTypes.map((r) => [r, r])) as { [K in InvestmentType]: K };

/** 持仓状态：active 持有 / sold 已售 / matured 到期 / deleted 已删 / Holding status: active / sold / matured / deleted */
export const investmentStatuses = ["active", "sold", "matured", "deleted"] as const;
export type InvestmentStatus = (typeof investmentStatuses)[number];
export const INVESTMENT_STATUS = Object.fromEntries(
  investmentStatuses.map((s) => [s, s]),
) as { [K in InvestmentStatus]: K };

/* ===== 菜单设备类型 / Menu device types ===== */

/** 菜单设备类型：desktop=桌面侧边栏 / mobile=移动端底部 tab（mobile 菜单同时出现在桌面导航）/ Menu device type: desktop=sidebar / mobile=bottom tab (mobile menu also shows in desktop nav) */
export const menuDeviceTypes = ["desktop", "mobile"] as const;
export type MenuDeviceType = (typeof menuDeviceTypes)[number];

/** 菜单设备类型值常量（对象式访问，运行时可比 `DEVICE.mobile` === menu.deviceType）/ Menu device type value constants (object-style; at runtime `DEVICE.mobile` === menu.deviceType) */
export const DEVICE = Object.fromEntries(menuDeviceTypes.map((r) => [r, r])) as { [K in MenuDeviceType]: K };
