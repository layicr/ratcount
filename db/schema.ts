/**
 * ratcount · 数据库 Schema（Drizzle ORM）
 * 共 14 张表：users / ledgers / ledger_members / settings / currencies /
 *             accounts / categories / tags / projects / transactions /
 *             transaction_tags / audit_logs / balances / recurring_plans
 *
 * 核心设计口径：
 *  - 金额一律存整数"分"（*_cents），前端只展示
 *  - 账户余额不落库：仅存 opening_balance，当前余额 = 期初 + 流水实时汇总
 *  - 业务表全部带 ledger_id + scopeGuard 强制账本隔离
 *  - 全部表含 remark 备注字段；ledgers/accounts/categories/projects 含 icon
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/* ===== 通用字段构造器 ===== */

/** 主键：随机 UUID（便于 Turso 云端分布式写入） */
const id = () =>
  text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

/** 创建时间：ISO 字符串 */
const createdAt = () =>
  text("created_at").notNull().$defaultFn(() => new Date().toISOString());

/** 更新时间：ISO 字符串，Drizzle 层自动维护 */
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString());

/* ===== 枚举（TS 联合类型 + 注释） ===== */

/** 用户角色：admin=管理员（首个注册用户自动成为），user=普通用户 */
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

/** 账本成员角色 */
export const memberRoles = ["owner", "editor", "viewer"] as const;
export type MemberRole = (typeof memberRoles)[number];

/** 账户类型（12 种）：cash 现金 / debit_card 储蓄卡 / credit_card 信用账户 /
 *  wechat 虚拟账户 / savings 定期 / investment 股票 / fund 基金 /
 *  precious_metal 贵金属 / bond 国债 / foreign_currency 外币账户 /
 *  real_estate 不动产 / custom 自定义 */
export const accountTypes = [
  "cash", "debit_card", "credit_card", "wechat", "savings",
  "investment", "fund", "precious_metal", "bond", "foreign_currency",
  "real_estate", "custom",
] as const;
export type AccountType = (typeof accountTypes)[number];

/** 交易类型：income 收入 / expense 支出 / transfer 转账（不计收支） */
export const transactionTypes = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

/** 审计动作：C=新增 / R=查看（动作类） / U=修改 / D=删除 */
export const auditActions = ["C", "R", "U", "D"] as const;
export type AuditAction = (typeof auditActions)[number];

/* ====================================================================
 * 1. users 用户表
 * ==================================================================== */
export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(), // bcrypt 哈希
    name: text("name").notNull().default(""), // 显示名
    role: text("role").$type<UserRole>().notNull().default("user"),
    status: text("status").notNull().default("active"), // active/disabled
    remark: text("remark"), // 备注
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/* ====================================================================
 * 2. ledgers 账本表
 * ==================================================================== */
export const ledgers = sqliteTable(
  "ledgers",
  {
    id: id(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📒"), // 账本图标
    baseCurrencyCode: text("base_currency_code").notNull().default("CNY"), // 基准币种
    remark: text("remark"), // 备注
    createdBy: text("created_by").notNull(), // 创建人 user_id
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/* ====================================================================
 * 3. ledger_members 账本成员表（用户↔账本 权限）
 * ==================================================================== */
export const ledgerMembers = sqliteTable(
  "ledger_members",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").$type<MemberRole>().notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ledger_members_uk").on(t.ledgerId, t.userId)],
);

/* ====================================================================
 * 4. settings 设置表（key-value，带显示名）
 *    userId='global'=全局设置；其他=用户级设置
 *    全局键：app_name / default_locale / allow_registration /
 *            enable_login_captcha / audit_log_retention_days / copyright
 * ==================================================================== */
export const settings = sqliteTable(
  "settings",
  {
    id: id(),
    name: text("name"), // 设置项显示名称
    userId: text("user_id").notNull().default("global"), // global=全局；其他=用户编号
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedBy: text("updated_by"), // 修改人 user_id
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("settings_uk").on(t.userId, t.key)],
);

/* ====================================================================
 * 5. currencies 币种表
 * ==================================================================== */
export const currencies = sqliteTable(
  "currencies",
  {
    code: text("code").primaryKey(), // 如 CNY / USD
    symbol: text("symbol").notNull().default("¥"), // 货币符号
    nameZh: text("name_zh").notNull().default(""),
    nameEn: text("name_en").notNull().default(""),
    rate: text("rate").notNull().default("1"), // 相对基准币种汇率（DECIMAL 存文本避免浮点）
    isBase: integer("is_base", { mode: "boolean" }).notNull().default(false), // 是否基准币种
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sort: integer("sort").notNull().default(0),
    remark: text("remark"), // 备注
  },
);

/* ====================================================================
 * 6. accounts 账户表
 * ==================================================================== */
export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull().default("cash"),
    icon: text("icon").notNull().default("💳"), // 账户图标
    currencyCode: text("currency_code").notNull().default("CNY"),
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0), // 期初余额（分）
    isAsset: integer("is_asset", { mode: "boolean" }).notNull().default(true), // 是否计入资产
    sort: integer("sort").notNull().default(0),
    remark: text("remark"), // 备注（原 note 更名）
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 7. categories 分类表
 * ==================================================================== */
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<"income" | "expense">().notNull(), // 收支方向
    icon: text("icon").notNull().default("📦"), // 分类图标
    sort: integer("sort").notNull().default(0),
    remark: text("remark"), // 备注
    createdAt: createdAt(),
  },
  (t) => [index("categories_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 8. tags 标签表（账本级，与流水多对多）
 * ==================================================================== */
export const tags = sqliteTable(
  "tags",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#0d9488"), // 标签颜色
    remark: text("remark"), // 备注
    createdAt: createdAt(),
  },
  (t) => [index("tags_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 9. projects 项目表（流水单归属；删项目置空不删流水）
 * ==================================================================== */
export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📁"), // 项目图标
    budgetCents: integer("budget_cents").notNull().default(0), // 预算（分）
    status: text("status").notNull().default("active"), // active/completed/archived
    startDate: text("start_date"), // YYYY-MM-DD
    endDate: text("end_date"),
    remark: text("remark"), // 备注
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 10. transactions 流水表（主表）
 * ==================================================================== */
export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    accountId: text("account_id").notNull(), // 来源账户
    toAccountId: text("to_account_id"), // 转账目标账户（仅 transfer）
    type: text("type").$type<TransactionType>().notNull(),
    categoryId: text("category_id"), // 分类（transfer 可为空）
    projectId: text("project_id"), // 归属项目（可空）
    amountCents: integer("amount_cents").notNull(), // 金额（分，恒为正）
    txDate: text("tx_date").notNull(), // 发生日期 YYYY-MM-DD
    remark: text("remark"), // 备注（原 note 更名）
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tx_ledger_date_idx").on(t.ledgerId, t.txDate),
    index("tx_ledger_acct_idx").on(t.ledgerId, t.accountId),
    index("tx_ledger_cat_idx").on(t.ledgerId, t.categoryId),
    index("tx_ledger_proj_idx").on(t.ledgerId, t.projectId),
  ],
);

/* ====================================================================
 * 11. transaction_tags 流水↔标签 多对多
 * ==================================================================== */
export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    id: id(),
    transactionId: text("transaction_id").notNull(),
    tagId: text("tag_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tx_tags_uk").on(t.transactionId, t.tagId),
    index("tx_tags_tag_idx").on(t.tagId),
  ],
);

/* ====================================================================
 * 12. audit_logs 操作日志表（写操作留痕：C 新增 / U 修改 / D 删除；
 *     查询类操作不再记录日志）
 *     - 按用户维度记录（user_id），不再按账本
 *     - 支持记录请求内容 / 响应内容
 * ==================================================================== */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").notNull(), // 操作者（用户编号）
    action: text("action").$type<AuditAction>().notNull(),
    entity: text("entity").notNull(), // 对象类型：transaction/account/...
    entityId: text("entity_id"), // 对象 ID
    summary: text("summary"), // 摘要（如"新增流水 山姆会员店 -¥486"）
    requestBody: text("request_body"), // 请求内容（JSON 字符串）
    responseBody: text("response_body"), // 响应内容（JSON 字符串）
    ip: text("ip"), // 来源 IP
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_user_time_idx").on(t.userId, t.createdAt),
    index("audit_entity_time_idx").on(t.entity, t.createdAt),
  ],
);

/* ====================================================================
 * 13. balances 余额快照表（期末对账；当前余额仍由流水实时汇总）
 * ==================================================================== */
export const balances = sqliteTable(
  "balances",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    accountId: text("account_id").notNull(),
    balanceAmountCents: integer("balance_amount_cents").notNull(), // 快照余额（分）
    snapshotDate: text("snapshot_date").notNull(), // 快照日期 YYYY-MM-DD
    remark: text("remark"), // 备注
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("balances_acct_date_uk").on(t.ledgerId, t.accountId, t.snapshotDate),
    index("balances_acct_time_idx").on(t.accountId, t.snapshotDate),
  ],
);

/* ====================================================================
 * 14. recurring_plans 周期计划表（按频率自动/手动生成流水）
 *     frequency: daily 每天 / weekly 每周 / monthly 每月 / yearly 每年
 *     dayOfMonth: monthly 每月几号（1-31，超月自动取月末）
 *     dayOfWeek: weekly 每周几（0=周日 … 6=周六）
 *     nextDate: 下次执行日期（YYYY-MM-DD），执行后自动推进
 * ==================================================================== */
export const recurringFrequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof recurringFrequencies)[number];

export const recurringPlans = sqliteTable(
  "recurring_plans",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(), // 计划名称
    type: text("type").$type<TransactionType>().notNull(),
    amountCents: integer("amount_cents").notNull(), // 金额（分，恒为正）
    frequency: text("frequency").$type<RecurringFrequency>().notNull().default("monthly"),
    dayOfMonth: integer("day_of_month"), // 每月几号（1-31）
    dayOfWeek: integer("day_of_week"), // 每周几（0-6）
    accountId: text("account_id").notNull(), // 出账/入账账户
    toAccountId: text("to_account_id"), // 转账目标账户（仅 transfer）
    categoryId: text("category_id"), // 分类（transfer 可为空）
    projectId: text("project_id"), // 归属项目
    nextDate: text("next_date").notNull(), // 下次执行日期 YYYY-MM-DD
    status: text("status").notNull().default("active"), // active/paused
    remark: text("remark"), // 备注
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recurring_ledger_idx").on(t.ledgerId)],
);

/** 汇总导出，供 Drizzle 实例与 seed 使用 */
export const schema = {
  users,
  ledgers,
  ledgerMembers,
  settings,
  currencies,
  accounts,
  categories,
  tags,
  projects,
  transactions,
  transactionTags,
  auditLogs,
  balances,
  recurringPlans,
};
