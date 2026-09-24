/**
 * ratcount · 数据库 Schema（Drizzle ORM）/ Database schema (Drizzle ORM)
 * 共 21 张表：users / ledgers / ledger_members / settings / currencies /
 *             accounts / categories / tags / projects / transactions /
 *             transaction_tags / holding_tags / audit_logs / balances /
 *             recurring_plans / investment_holdings /
 *             menu_groups / menus / user_menu_config / languages / user_profiles
 *
 * 核心设计口径 / Core design rules：
 *  - 金额一律存整数"分"（*_cents），前端只展示 / All amounts stored as integer cents (*_cents); front-end only displays
 *  - 账户余额不落库：仅存 opening_balance，当前余额 = 期初 + 流水实时汇总 / Balances are not stored: only opening_balance; live balance = opening + aggregated tx
 *  - 业务表全部带 ledger_id + scopeGuard 强制账本隔离 / All business tables carry ledger_id + scopeGuard for ledger isolation
 *  - 全部表含 remark 备注字段；ledgers/accounts/categories/projects 含 icon / All tables have remark; ledgers/accounts/categories/projects have icon
 *  - 导航数据驱动：menu_groups（分组）+ menus（菜单项）+ user_menu_config（账本+用户启用）
 *    取代早期 ledgers.menu_config JSON 列
 *    Data-driven nav: menu_groups + menus + user_menu_config (per ledger+user), replacing the early ledgers.menu_config JSON column.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  TRUE, FALSE, DEFAULT_CURRENCY, DEFAULT_LEDGER_ICON, GLOBAL_USER_ID, ROLE, MR, ACCT, USER_STATUS, MENU_STATUS, PROJECT_STATUS, FREQ, RECURRING_STATUS, INVESTMENT_STATUS, DEVICE, RecurringFrequency, UserRole, UserStatus, MemberRole, AccountType, CategoryType, TransactionType, AuditAction, ProjectStatus, RecurringStatus, InvestmentStatus, InvestmentType, MenuStatusCode, MenuDeviceType } from "@/lib/constants";

/* ===== 通用字段构造器 / Common column builders ===== */

/** 主键：随机 UUID（便于 Turso 云端分布式写入）/ Primary key: random UUID (suits distributed writes on Turso) */
const id = () =>
  text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

/** 创建时间：ISO 字符串 / createdAt: ISO string */
const createdAt = () =>
  text("created_at").notNull().$defaultFn(() => new Date().toISOString());

/** 更新时间：ISO 字符串，Drizzle 层自动维护 / updatedAt: ISO string, auto-maintained by Drizzle */
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString());


/* ====================================================================
 * 1. users 用户表 / users table
 * ==================================================================== */


export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(), // bcrypt 哈希 / bcrypt hash
    name: text("name").notNull().default(""), // 显示名称 / display name
    role: text("role").$type<UserRole>().notNull().default(ROLE.user),
    status: text("status").$type<UserStatus>().notNull().default(USER_STATUS.active), // active/disabled
    // 会话版本：改密 / 管理员重置密码 / 禁用时自增，使已签发的 JWT 立即失效（无状态会话的吊销手段）/ Session version: bumped on password change / admin reset / disable to instantly invalidate issued JWTs (revocation for stateless sessions)
    tokenVersion: integer("token_version").notNull().default(0),
    remark: text("remark"), // 备注 / remark
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_created_at_idx").on(t.createdAt),
  ],
);

/* ====================================================================
 * 2. ledgers 账本表 / ledgers table
 * ==================================================================== */
export const ledgers = sqliteTable(
  "ledgers",
  {
    id: id(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default(DEFAULT_LEDGER_ICON), // 账本图标 / ledger icon
    baseCurrencyCode: text("base_currency_code").notNull().default(DEFAULT_CURRENCY), // 基准币种 / base currency
    remark: text("remark"), // 备注 / remark
    createdBy: text("created_by").notNull(), // 创建人 user_id / creator user_id
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/* ====================================================================
 * 3. ledger_members 账本成员表（用户↔账本 权限）/ ledger_members (user↔ledger permissions)
 * ==================================================================== */
export const ledgerMembers = sqliteTable(
  "ledger_members",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").$type<MemberRole>().notNull().default(MR.viewer),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_members_uk").on(t.ledgerId, t.userId),
    index("ledger_members_user_idx").on(t.userId),
  ],
);

/* ====================================================================
 * 4. settings 设置表（key-value，带显示名）/ settings (key-value with display name)
 *    userId='global'=全局设置；其他=用户级设置 / userId='global' = global; other = per-user
 *    全局键：app_name / app_slogan / default_locale / allow_registration /
 *            enable_login_captcha / audit_log_retention_days / copyright
 * ==================================================================== */


export const settings = sqliteTable(
  "settings",
  {
    id: id(),//编号 / id
    name: text("name"), // 显示名称 / display name
    userId: text("user_id").notNull().default(GLOBAL_USER_ID), // global=全局；其他=用户编号 / global=global; else user id
    key: text("key").notNull(),//全局键名 / global key name
    value: text("value").notNull(),//全局值内容 / global value
    updatedBy: text("updated_by"), // 修改人编号 user_id / last editor user_id
    updatedAt: updatedAt(),//修改时间 / updated at
  },
  (t) => [uniqueIndex("settings_uk").on(t.userId, t.key)],
);

/* ====================================================================
 * 5. currencies 币种表 / currencies table
 * ==================================================================== */
export const currencies = sqliteTable(
  "currencies",
  {
    code: text("code").primaryKey(), // 如 CNY / USD / e.g. CNY / USD
    symbol: text("symbol").notNull().default("¥"), // 货币符号 / currency symbol
    name: text("name").notNull().default(""), // 币种名称（中英文合并，如「人民币 CNY」）/ currency name (zh+en, e.g. "人民币 CNY")
    rate: text("rate").notNull().default("1"), // 相对基准币种汇率（DECIMAL 存文本避免浮点）/ rate vs base (DECIMAL as text to avoid floats)
    isBase: integer("is_base", { mode: "boolean" }).notNull().default(FALSE), // 是否基准币种 / is base currency
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(TRUE), // 是否启用（停用后不在列表显示）/ active (disabled hidden from lists)
    sort: integer("sort").notNull().default(0), // 排序权重（数字越小越靠前）/ sort weight (smaller first)
    remark: text("remark"), // 备注 / remark
    updatedBy: text("updated_by"), // 最后修改人 user_id / last editor user_id
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/* ====================================================================
 * 6. accounts 账户表 / accounts table
 * ==================================================================== */
export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull().default(ACCT.cash),
    icon: text("icon").notNull().default("💳"), // 账户图标 / account icon
    currencyCode: text("currency_code").notNull().default(DEFAULT_CURRENCY), // 账户币种代码（默认 CNY）/ account currency code (default CNY)
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0), // 期初余额（分，原币 = currencyCode）/ opening balance (cents, native = currencyCode)
    baseOpeningBalanceCents: integer("base_opening_balance_cents").notNull().default(0), // 期初余额折算基准币种（分，写入时快照，历史不可变）/ opening balance in base currency (snapshot at write)
    isAsset: integer("is_asset", { mode: "boolean" }).notNull().default(TRUE), // 是否计入资产 / counts as asset
    sort: integer("sort").notNull().default(0),
    remark: text("remark"), // 备注（原 note 更名）/ remark (renamed from note)
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 7. categories 分类表 / categories table
 * ==================================================================== */
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<CategoryType>().notNull(), // 收支方向 / income/expense direction
    icon: text("icon").notNull().default("📦"), // 分类图标 / category icon
    sort: integer("sort").notNull().default(0),
    remark: text("remark"), // 备注 / remark
    createdAt: createdAt(),
  },
  (t) => [index("categories_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 8. tags 标签表（账本级，与流水多对多）/ tags (per ledger, many-to-many with transactions)
 * ==================================================================== */
export const tags = sqliteTable(
  "tags",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#0d9488"), // 标签颜色 / tag color
    remark: text("remark"), // 备注 / remark
    createdAt: createdAt(),
  },
  (t) => [index("tags_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 9. projects 项目表（流水单归属；删项目置空不删流水）/ projects (tx ownership; deleting a project nulls the link, keeps tx)
 * ==================================================================== */


export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📁"), // 项目图标 / project icon
    budgetCents: integer("budget_cents").notNull().default(0), // 预算（分）/ budget (cents)
    status: text("status").$type<ProjectStatus>().notNull().default(PROJECT_STATUS.active),
    startDate: text("start_date"), // YYYY-MM-DD
    endDate: text("end_date"),
    remark: text("remark"), // 备注 / remark
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 10. transactions 流水表（主表）/ transactions (main table)
 * ==================================================================== */
export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    accountId: text("account_id").notNull(), // 来源账户 / source account
    toAccountId: text("to_account_id"), // 转账目标账户（仅 transfer）/ transfer target (transfer only)
    type: text("type").$type<TransactionType>().notNull(),
    categoryId: text("category_id"), // 分类（transfer 可为空）/ category (nullable for transfer)
    projectId: text("project_id"), // 归属项目（可空）/ owning project (nullable)
    amountCents: integer("amount_cents").notNull(), // 金额（分，恒为正，原币 = currencyCode）/ amount (cents, positive, native = currencyCode)
    currencyCode: text("currency_code").notNull().default(DEFAULT_CURRENCY), // 原币代码（= 来源账户币种）/ native currency (= source account's currency)
    toCurrencyCode: text("to_currency_code"), // 转账目标账户币种（仅 transfer）/ transfer target currency (transfer only)
    usedRateFrom: text("used_rate_from"), // 快照：原币→基准汇率（写入时）/ snapshot: native→base rate at write
    usedRateTo: text("used_rate_to"), // 快照：目标币种→基准汇率（写入时）/ snapshot: target→base rate at write
    toAmountCents: integer("to_amount_cents"), // 转账目标账户入账金额（分，原币 = toCurrencyCode；非 transfer 为空）/ transfer credit amount (native = toCurrencyCode; null for non-transfer)
    baseAmountCents: integer("base_amount_cents").notNull().default(0), // 折算到基准币种的金额（分，写入时快照，历史不可变）/ amount in base currency (snapshot at write, immutable)
    txDate: text("tx_date").notNull(), // 发生日期 YYYY-MM-DD / occurred date YYYY-MM-DD
    remark: text("remark"), // 备注（原 note 更名）/ remark (renamed from note)
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tx_ledger_date_idx").on(t.ledgerId, t.txDate),
    index("tx_ledger_acct_idx").on(t.ledgerId, t.accountId),
    index("tx_ledger_to_acct_idx").on(t.toAccountId),
    index("tx_ledger_cat_idx").on(t.ledgerId, t.categoryId),
    index("tx_ledger_proj_idx").on(t.ledgerId, t.projectId),
    index("tx_ledger_type_idx").on(t.ledgerId, t.type),
    // 报表「账本 + 类型 + 日期区间」高频组合（分类占比 / 项目盈亏 / 标签统计）/ Report hot combo "ledger + type + date range" (category breakdown / project P&L / tag stats)
    index("tx_ledger_type_date_idx").on(t.ledgerId, t.type, t.txDate),
  ],
);

/* ====================================================================
 * 11. transaction_tags 流水↔标签 多对多 / transaction↔tag many-to-many
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
 * 11-b. holding_tags 持仓↔标签 多对多（持仓自身标签，编辑页可改）
 *     与流水标签相互独立：新建持仓时同一组标签会同时打到「买入/存入」流水上
 * holding_tags: holding↔tag many-to-many (holding's own tags, editable in the form).
 * Independent from transaction tags: on create, the same tags are also applied to the buy/deposit tx.
 * ==================================================================== */
export const holdingTags = sqliteTable(
  "holding_tags",
  {
    id: id(),
    holdingId: text("holding_id").notNull(),
    tagId: text("tag_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("holding_tags_uk").on(t.holdingId, t.tagId),
    index("holding_tags_tag_idx").on(t.tagId),
  ],
);

/* ====================================================================
 * 12. audit_logs 操作日志表（写操作留痕：C 新增 / U 修改 / D 删除；
 *     查询类操作不再记录日志）
 *     - 按用户维度记录（user_id），不再按账本
 *     - 支持记录请求内容 / 响应内容
 * audit_logs (write-op trail: C create / U update / D delete; reads are no longer logged)
 *     - Recorded per user (user_id), not per ledger
 *     - Can store request / response bodies
 * ==================================================================== */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").notNull(), // 操作者（用户编号）/ actor (user id)
    action: text("action").$type<AuditAction>().notNull(),
    entity: text("entity").notNull(), // 对象类型：transaction/account/... / entity type
    entityId: text("entity_id"), // 对象 ID / entity ID
    summary: text("summary"), // 摘要文本（默认语言渲染，用于搜索/回退；i18n 时配合 summary_key）/ summary (default-locale rendered, for search/fallback; paired with summary_key for i18n)
    summaryKey: text("summary_key"), // i18n 消息键（优先于 summary 渲染）/ i18n message key (rendered in preference to summary)
    summaryParams: text("summary_params"), // i18n 参数 JSON / i18n params JSON
    requestBody: text("request_body"), // 请求内容（JSON 字符串）/ request body (JSON string)
    responseBody: text("response_body"), // 响应内容（JSON 字符串）/ response body (JSON string)
    ip: text("ip"), // 来源 IP / source IP
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_user_time_idx").on(t.userId, t.createdAt),
    index("audit_entity_time_idx").on(t.entity, t.createdAt),
    index("audit_created_at_idx").on(t.createdAt),
  ],
);


/* ====================================================================
 * 13. balances 余额快照表（期末对账；当前余额仍由流水实时汇总）
 * balances: balance snapshots (period-end reconciliation; live balance still derived from tx)
 * ==================================================================== */
export const balances = sqliteTable(
  "balances",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    accountId: text("account_id").notNull(),
    balanceAmountCents: integer("balance_amount_cents").notNull(), // 快照余额（分，原币 = currencyCode）/ snapshot balance (cents, native = currencyCode)
    currencyCode: text("currency_code").notNull().default(DEFAULT_CURRENCY), // 原币代码（= 账户币种）/ native currency (= account currency)
    usedRate: text("used_rate"), // 快照：原币→基准汇率（写入时）/ snapshot: native→base rate at write
    baseBalanceAmountCents: integer("base_balance_amount_cents").notNull().default(0), // 折算基准币种余额（分，写入时快照）/ base-currency balance (snapshot)
    snapshotDate: text("snapshot_date").notNull(), // 快照日期 YYYY-MM-DD / snapshot date YYYY-MM-DD
    remark: text("remark"), // 备注 / remark
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
 * recurring_plans (auto/manual tx generation by frequency)
 *     frequency: daily / weekly / monthly / yearly
 *     dayOfMonth: day of month for monthly (1-31; overflow clamps to month end)
 *     dayOfWeek: day of week for weekly (0=Sun … 6=Sat)
 *     nextDate: next run date (YYYY-MM-DD), advances after each run
 * ==================================================================== */


export const recurringPlans = sqliteTable(
  "recurring_plans",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name").notNull(), // 计划名称 / plan name
    type: text("type").$type<TransactionType>().notNull(),
    amountCents: integer("amount_cents").notNull(), // 金额（分，恒为正）/ amount (cents, always positive)
    frequency: text("frequency").$type<RecurringFrequency>().notNull().default(FREQ.monthly),
    dayOfMonth: integer("day_of_month"), // 每月几号（1-31）/ day of month (1-31)
    dayOfWeek: integer("day_of_week"), // 每周几（0-6）/ day of week (0-6)
    accountId: text("account_id").notNull(), // 出账/入账账户 / debit/credit account
    toAccountId: text("to_account_id"), // 转账目标账户（仅 transfer）/ transfer target (transfer only)
    categoryId: text("category_id"), // 分类（transfer 可为空）/ category (nullable for transfer)
    projectId: text("project_id"), // 归属项目 / owning project
    nextDate: text("next_date").notNull(), // 下次执行日期 YYYY-MM-DD / next run date YYYY-MM-DD
    status: text("status").$type<RecurringStatus>().notNull().default(RECURRING_STATUS.active), // active/paused
    remark: text("remark"), // 备注 / remark
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recurring_ledger_idx").on(t.ledgerId)],
);

/* ====================================================================
 * 16. investment_holdings 投资持仓表 / investment holdings
 *     type: stock 股票 / fund 基金 / deposit 定期 / bond 国债 /
 *           metal 贵金属 / real_estate 不动产 /
 *           digital_asset 数字资产（同股票） / collectible 收藏品（同基金） /
 *           insurance 储蓄型保险 / loan 民间借贷
 *     sub_type: 贵金属细分 gold 黄金 / silver 白银（其他类型可空）
 *     quantity: 数量（整数存储：股数/份额×10000/克数×100/面积×100）
 *     cost_cents: 买入成本（分，不含交易费用）
 *     fee_cents: 交易费用（分，佣金+印花税+过户费等）
 *     current_value_cents: 当前市值（分，手动更新或价格计算）
 *     account_id: 关联账户（持仓归属的投资账户，如股票账户）
 *     payment_account_id: 扣款账户（买入时实际付出资金的资金账户，如现金/银行卡）
 *     实际成本 = cost_cents + fee_cents
 *     收益 = current_value_cents - (cost_cents + fee_cents)
 * ==================================================================== */


export const investmentHoldings = sqliteTable(
  "investment_holdings",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(),
    createdBy: text("created_by").notNull(),
    type: text("type").$type<InvestmentType>().notNull(),
    subType: text("sub_type"), // 子类型（如贵金属 gold/silver；其他类型可空）/ sub-type (e.g. metal gold/silver; nullable for others)
    name: text("name").notNull(),
    code: text("code"), // 股票/基金代码 / stock/fund code
    accountId: text("account_id").notNull(), // 关联账户（持仓归属的投资账户）/ linked account (the investment account holding it)
    paymentAccountId: text("payment_account_id").notNull(), // 扣款账户：买入时资金付出的账户 / payment account: the account that paid on buy
    quantity: integer("quantity").notNull().default(0), // 数量（整数存储）/ quantity (integer stored)
    costCents: integer("cost_cents").notNull().default(0), // 买入成本（分）/ purchase cost (cents)
    feeCents: integer("fee_cents").notNull().default(0), // 交易费用（分）/ trading fees (cents)
    currentValueCents: integer("current_value_cents").notNull().default(0), // 当前市值（分）/ current market value (cents)
    purchaseDate: text("purchase_date"), // 买入/起息日期 YYYY-MM-DD / purchase/accrual date YYYY-MM-DD
    maturityDate: text("maturity_date"), // 到期日期（定期/国债）/ maturity date (deposit/bond)
    interestRate: text("interest_rate"), // 利率（定期/国债，存文本如"2.60%"）/ interest rate (deposit/bond, text e.g. "2.60%")
    location: text("location"), // 地址（不动产）/ location (real estate)
    areaSqm: integer("area_sqm"), // 面积×100（不动产）/ area ×100 (real estate)
    status: text("status").$type<InvestmentStatus>().notNull().default(INVESTMENT_STATUS.active), // active/sold/matured/deleted
    dividendCents: integer("dividend_cents").notNull().default(0), // 累计派息（分）：派息时累加，市值同步除权 / cumulative dividends (cents): added on payout, value ex-div
    remark: text("remark"),
    projectId: text("project_id"), // 归属项目（可空）/ owning project (nullable)
    buyTransactionId: text("buy_transaction_id"), // 买入「转账」流水 id 指针；为空表示旧持仓 / 未生成买入流水（paymentAccountId=关联账户 或 金额=0）/ buy transfer id pointer; null for legacy holdings or when no buy transfer was generated
    currencyCode: text("currency_code").notNull().default(DEFAULT_CURRENCY), // 原币代码（= 关联账户币种）/ native currency (= linked account currency)
    usedRate: text("used_rate"), // 快照：原币→基准汇率（写入时）/ snapshot: native→base rate at write
    baseCostCents: integer("base_cost_cents").notNull().default(0), // 成本折算基准（分）/ cost in base
    baseFeeCents: integer("base_fee_cents").notNull().default(0), // 费用折算基准（分）/ fee in base
    baseValueCents: integer("base_value_cents").notNull().default(0), // 市值折算基准（分）/ value in base
    baseDividendCents: integer("base_dividend_cents").notNull().default(0), // 累计派息折算基准（分）/ cumulative dividend in base
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inv_ledger_idx").on(t.ledgerId),
    index("inv_ledger_type_idx").on(t.ledgerId, t.type),
    index("inv_status_idx").on(t.status),
    // 净资产 / 资产分布口径：账本内活跃持仓（ledgerId + status）/ Net worth / distribution scope: active holdings in ledger (ledgerId + status)
    index("inv_ledger_status_idx").on(t.ledgerId, t.status),
    index("inv_proj_idx").on(t.ledgerId, t.projectId),
    index("inv_purchase_date_idx").on(t.purchaseDate),
  ],
);

/* ====================================================================
 * 16. menu_groups 菜单分组表（全局导航分组，替代导航分组硬编码）/ menu_groups (global nav groups, replacing hardcoded groups)
 * ==================================================================== */
export const menuGroups = sqliteTable(
  "menu_groups",
  {
    menuGroupId: text("menu_group_id").primaryKey(), // 主键，如 book / invest / protection / manage / PK, e.g. book / invest / protection / manage
    name: text("name").notNull().default("{}"), // 多语言名称 JSON，如 {"zh-CN":"记账","en":"Bookkeeping"} / multilingual name JSON
    sort: integer("sort").notNull().default(0), // 分组排序 / group sort
    remark: text("remark"), // 备注 / remark
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/** 菜单状态（active=启用 / disabled=禁用）已统一定义于 lib/constants.ts 的 STATUS/MENU_STATUS，此处不重复声明 / Menu status (active/disabled) is defined in lib/constants.ts STATUS/MENU_STATUS; not redeclared here */


/* ====================================================================
 * 17. menus 菜单表（全局导航目录，导航唯一数据源）
 *     menu_id 即 i18n 键（如 nav.add）；显示名存于 name JSON，渲染按 locale 取，回退 t(key)。
 * menus (global nav catalog, the single source of nav truth)
 *     menu_id is the i18n key (e.g. nav.add); display name lives in name JSON, picked by locale, falls back to t(key).
 * ==================================================================== */
export const menus = sqliteTable(
  "menus",
  {
    menuId: text("menu_id").primaryKey(), // i18n 键，如 nav.add / i18n key, e.g. nav.add
    name: text("name").notNull().default("{}"), // 多语言名称 JSON，如 {"zh-CN":"记一笔","en":"Add"} / multilingual name JSON
    icon: text("icon").notNull().default("📄"), // 图标 emoji / icon emoji
    menuGroupId: text("menu_group_id").notNull(), // 关联 menu_groups.menu_group_id / FK to menu_groups.menu_group_id
    sort: integer("sort").notNull().default(0), // 组内排序 / sort within group
    statusCode: text("status_code").$type<MenuStatusCode>().notNull().default(MENU_STATUS.active), // active/disabled
    deviceType: text("device_type").$type<MenuDeviceType>().notNull().default(DEVICE.desktop), // desktop/mobile
    link: text("link").notNull(), // 链接地址 href / link href
    remark: text("remark"), // 备注 / remark
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("menus_group_idx").on(t.menuGroupId),
    index("menus_status_idx").on(t.statusCode),
    index("menus_status_device_idx").on(t.statusCode, t.deviceType),
  ],
);

/* ====================================================================
 * 18. user_menu_config 用户菜单配置表 / user menu config
 *     从 ledgers.menu_config JSON 列抽出的关联表：表示「某用户在某账本」启用了哪些菜单项。
 *     user_id：用户编号，菜单显隐按「账本 + 用户」隔离（同一账本不同成员互不影响）。
 *     无记录 = 默认全部启用（兼容旧数据 / 新注册账本）。
 * Join table extracted from the ledgers.menu_config JSON column: which menu items a user enabled in a ledger.
 *     user_id: menu visibility is isolated per "ledger + user" (members don't affect each other).
 *     No rows = all enabled by default (backward compatible with old data / new ledgers).
 * ==================================================================== */
export const userMenuConfig = sqliteTable(
  "user_menu_config",
  {
    id: id(),
    ledgerId: text("ledger_id").notNull(), // 关联 ledgers.id / FK to ledgers.id
    userId: text("user_id").notNull(), // 关联 users.id / FK to users.id
    menuId: text("menu_id").notNull(), // 关联 menus.menu_id / FK to menus.menu_id
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("user_menu_config_uk").on(t.ledgerId, t.userId, t.menuId),
    index("user_menu_config_ledger_idx").on(t.ledgerId),
    index("user_menu_config_user_idx").on(t.userId),
  ],
);

/* ====================================================================
 * 19. languages 语言表（语言清单：启用/默认/排序/显示名，后台可运营）
 *     code 即 locale：zh / en / zh-TW ...（与 i18n/routing.ts 静态超集对应）
 * languages (language list: enabled/default/sort/display name, admin-manageable)
 *     code = locale: zh / en / zh-TW ... (matches the static superset in i18n/routing.ts)
 * ==================================================================== */
export const languages = sqliteTable(
  "languages",
  {
    code: text("code").primaryKey(), // locale 码（与 i18n/routing.ts 静态超集对应），如 zh / en / zh-TW / locale code, e.g. zh / en / zh-TW
    name: text("name").notNull().default(""), // 管理后台显示名 / admin display name
    nativeName: text("native_name").notNull().default(""), // 本语自称：中文 / English / 繁體中文 / endonym: 中文 / English / 繁體中文
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(FALSE), // 1 = 全局默认语言 / 1 = global default language
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(TRUE), // 0 = 停用 / 0 = disabled
    sort: integer("sort").notNull().default(0), // 展示顺序 / display order
    createdBy: text("created_by"), // 创建人 user_id / creator user_id
    updatedBy: text("updated_by"), // 最后修改人 user_id / last editor user_id
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);


/* ====================================================================
 * 20. user_profiles 用户扩展表（个人偏好：风格/语言/时区）
 *     - 与 users 一对一，user_id 为主键；缺失行视为默认偏好
 * user_profiles (personal prefs: theme/language/timezone)
 *     - One-to-one with users, user_id is PK; a missing row means default prefs
 * ==================================================================== */
export const userProfiles = sqliteTable(
  "user_profiles",
  {
    userId: text("user_id").primaryKey(), // 用户编号（关联 users.id）/ user id (FK to users.id)
    themeCode: text("theme_code"), // 风格代码（light/dark/ocean/...）/ theme code
    localeCode: text("locale_code"), // 用户语言代码（zh-CN/en/zh-TW）/ user locale code
    timezoneCode: text("timezone_code"), // 时区代码（IANA，如 Asia/Shanghai）/ timezone code (IANA)
    bio: text("bio"), // 个人宣言 / bio
    updatedAt: updatedAt(), // 最后修改时间 / last updated
  },
);

/** 汇总导出，供 Drizzle 实例与 seed 使用 / Aggregate export for the Drizzle instance and seed */
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
  holdingTags,
  auditLogs,
  balances,
  recurringPlans,
  investmentHoldings,
  menuGroups,
  menus,
  userMenuConfig,
  languages,
  userProfiles,
};
