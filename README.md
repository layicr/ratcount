# ratcount · 个人 / 家庭 / 生意记账系统
# ratcount · Personal / Family / Business Bookkeeping System

> Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS + Drizzle ORM / Turso(libSQL)，双部署 / dual-deploy
>
> 界面干净 · 功能全免费 · 逻辑简洁 · 数据自主可控
> Clean UI · fully free · simple logic · you own your data

一份可自托管的记账系统：本地 SQLite 零配置起步，改一行环境变量即可切到 Turso 云端；也能一键打包成桌面应用（Electron）。
A self-hostable bookkeeping system: start with zero-config local SQLite, switch to Turso cloud by one env var, or package it as a desktop app (Electron).
金额以整数「分」存储，账户余额不落库（期初 + 流水实时汇总），业务表全带账本隔离。
Amounts are stored as integer cents; account balances are not persisted (opening + live tx aggregation), and every business table is ledger-isolated.

---

## 目录 / Table of Contents

- [特性 / Features](#特性--features)
- [快速开始 / Quick Start](#快速开始--quick-start)
- [常用脚本 / Scripts](#常用脚本--scripts)
- [双部署 / Dual Deployment](#双部署--dual-deployment)
- [环境变量 / Environment Variables](#环境变量--environment-variables)
- [部署到 Vercel / Deploy to Vercel](#部署到-vercel--deploy-to-vercel)
- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [数据库设计 / Database](#数据库设计--database21-张表--21-tables)
- [架构与代码组织 / Architecture](#架构与代码组织--architecture)
- [国际化 / i18n](#国际化--i18n)
- [功能模块 / Modules](#功能模块--modules)
- [测试 / Testing](#测试--testing)
- [桌面模式（Electron）/ Desktop mode](#桌面模式electron)
- [许可证 / License](#许可证--license)

---

## 特性 / Features

- **双部署 / Dual-deploy**：本地 SQLite 与 Turso 云端仅差 `DATABASE_URL` 一行（见下）。
  Local SQLite vs Turso cloud differ only by the `DATABASE_URL` line.
- **桌面应用 / Desktop app**：同一套代码库可打包为 Electron 应用，本地跑真实 Node 服务 + 真实 `.db` 文件（见 [桌面模式](#桌面模式electron)）。
  One codebase also ships as an Electron desktop app running a real Node server with a real `.db` file.
- **数据自主 / Data sovereignty**：数据库在你手里，可随时导出、备份、迁移。
  The database is yours — export, backup and migrate anytime.
- **账本隔离 / Ledger isolation**：多账本、多成员，跨账本越权由 `scopeGuard` 强制拦截。
  Multiple ledgers and members; cross-ledger access is blocked by `scopeGuard`.
- **多币种 / Multi-currency**：账户、流水、余额、投资持仓均带币种与基准币种口径；汇率以文本 DECIMAL 存储，避免浮点误差；报表统一按基准币种聚合，原币仅作附注。
  Accounts / transactions / balances / holdings each carry a currency + base-currency figures; rates stored as text DECIMAL; reports aggregate in base currency, native amounts only as a footnote.
- **多语言 / i18n**：中文（简/繁）与英文，语言清单数据库化、后台可运营。
  zh-CN / zh-TW / en, with a DB-driven language catalog managed from the admin UI.
- **投资与保障 / Investments & protection**：10 类持仓 + 储蓄型保险/公积金/养老金/社保汇总；持仓可关联项目，计入项目汇总。
  10 holding types + protection roll-up (endowment insurance / housing fund / pension / social security); holdings can be linked to a project and roll into its summary.
- **项目聚合投资 / Projects roll up investments**：项目除预算外，还聚合关联 `investment_holdings`（`status=active`）的投入成本 / 当前市值 / 收益（基准币种），含多币种时展示「原币组成」。
  Besides budget, a project rolls up its linked `investment_holdings` (active) — invested cost / current value / profit in base currency, plus a native-currency breakdown when multi-currency.

---

## 快速开始 / Quick Start

### 网页模式 / Web mode

```bash
npm install          # 安装依赖 / install deps
npm run db:push      # 建表（Drizzle 推送 SQLite）+ 初始化演示数据/语言/分类 / create tables (Drizzle push) + init seed/languages/categories
npm run dev          # 启动开发服务器 → http://localhost:3200
```

演示账号 / Demo account：`admin@example.com` / `demo1234`
（登录页含图形验证码，点击图片可刷新 / login page has a captcha; click the image to refresh）。

种子脚本默认拒绝在 `NODE_ENV=production` 下执行（会清空数据表）。
The seed script refuses to run under `NODE_ENV=production` (it truncates tables).

### 桌面模式 / Desktop mode

```bash
npm install          # 含 electron / includes electron
npm run build:desktop   # 产出安装包 → release/RatCount-*-setup.exe
```

详见 [桌面模式](#桌面模式electron)。See [Desktop mode](#桌面模式electron) for details.

---

## 常用脚本 / Scripts

| 命令 Command | 说明 Description |
|---|---|
| `npm run dev` | 网页开发服务器（Turbopack，端口 3200）/ web dev server (Turbopack, port 3200) |
| `npm run build` / `npm run start` | 网页生产构建 / 启动（端口 3200）/ web production build / start (port 3200) |
| `npm run lint` | ESLint 检查 / ESLint |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`）/ type check |
| `npm run db:generate` | 生成迁移 / generate migration |
| `npm run db:migrate` | 执行迁移 / run migration |
| `npm run db:push` | 推送 schema 到数据库，并执行 `db/init` 初始化（语言/分类/默认数据）/ push schema + run `db/init` (languages/categories/defaults) |
| `npm run db:studio` | Drizzle Studio 可视化 / Drizzle Studio |
| `npm run db:seed` | 写入演示数据 / seed data |
| `npm test` | 单元测试（`tsx --test`）/ unit tests |
| `npm run test:e2e` | Playwright 端到端测试 / Playwright E2E |
| `npm run build:desktop` | 一键桌面构建：`next build(standalone)` → 补齐 static/public → esbuild 主进程 → electron-builder / one-shot desktop build |
| `npm run build:desktop:next` | 仅 Next 构建（注入 `NEXT_PUBLIC_DEPLOY_MODE=desktop`）/ Next build only |
| `npm run build:desktop:server` | 仅拷贝 standalone 静态资源 / copy standalone assets only |
| `npm run build:desktop:main` | 仅 esbuild 打包 Electron 主进程 / esbuild main process only |
| `npm run start:desktop` | 已构建后直接运行 `electron .` / run built app via `electron .` |
| `npm run dev:desktop` | 桌面开发模式（next dev + electron 热重载）/ desktop dev mode (hot reload) |

---

## 双部署 / Dual Deployment

仅改 `DATABASE_URL` 一行即可在本地 SQLite 与 Turso 云端之间切换（见 `.env.example`）：
Change only `DATABASE_URL` to switch between local SQLite and Turso cloud (see `.env.example`):

| 模式 Mode | `DATABASE_URL` | 说明 Description |
|---|---|---|
| 本地 Local | `file:./data/ratcount.db` | 默认；以 `file:` 开头即本地，零配置 / default; `file:` prefix = local, zero-config |
| 云端 Cloud | `libsql://<your-db>` | 非 `file:` 前缀即云端，需同时配置 `TURSO_AUTH_TOKEN` / non-`file:` = cloud; set `TURSO_AUTH_TOKEN` too |

桌面模式下数据库文件默认落在 exe 同目录（不可写时回退 userData），详见 [桌面模式](#桌面模式electron)。
In desktop mode the DB file defaults next to the exe (falls back to userData when not writable) — see [Desktop mode](#桌面模式electron).

---

## 环境变量 / Environment Variables

变量分两类：
Variables fall into two groups:

1. **由 `lib/env.ts` 用 Zod 校验**（启动时校验，缺失/非法时生产环境直接报错）/ **Validated by `lib/env.ts` via Zod** (checked at startup; production aborts on missing/invalid).
2. **直接读 `process.env`**（未进 Zod schema，由对应模块按需读取）/ **Read directly from `process.env`** (not in the Zod schema; read where needed).

### 1. 由 lib/env.ts 校验 / Validated by `lib/env.ts`

| 变量 Var | 默认值 Default | 说明 Description |
|---|---|---|
| `DATABASE_URL` | `file:./data/ratcount.db` | 双部署唯一开关 / the only switch for dual-deploy |
| `TURSO_AUTH_TOKEN` | — | 云端模式必填 / required in cloud mode |
| `AUTH_SECRET` | 开发回退随机值 | 必须 ≥16 位；生产建议 32 位以上强随机；缺失时生产启动直接报错 / ≥16 chars; ≥32 recommended in prod |
| `APP_NAME` | `ratcount` | 兜底应用名（后台「应用名称」设置优先）/ fallback app name |
| `DB_CONCURRENCY` | `20` | 驱动层并发上限（最接近「连接池」的杠杆）/ driver concurrency cap |
| `DB_STATEMENT_TIMEOUT_MS` | `5000` | 单条语句软超时（毫秒）/ per-statement soft timeout (ms) |
| `DB_MAX_RETRIES` | `3` | 瞬时错误最大重试次数 / max retries on transient errors |
| `DB_RETRY_BASE_DELAY_MS` | `200` | 重试退避基数（毫秒，指数增长）/ retry backoff base (ms, exponential) |
| `NODE_ENV` | `production` | 运行环境（默认 `production`，未显式设置即按生产严格校验）/ runtime env (defaults to `production` → strict validation) |

### 2. 直接读取 / Read directly

| 变量 Var | 默认值 Default | 说明 Description |
|---|---|---|
| `AUDIT_CLEANUP_MODE` | 自动判定 | 审计日志清理：空=自动 / `cron`=Vercel Cron / `local`=进程内定时器（见 `instrumentation.ts`）/ audit cleanup mode (see `instrumentation.ts`) |
| `CRON_SECRET` | — | 部署到 Vercel 时必填（保护 `/api/cron/*` 端点）/ required on Vercel (protects `/api/cron/*`) |
| `NEXT_PUBLIC_DEPLOY_MODE` | `server` | 部署模式：`desktop` 由 Electron 主进程启动子进程时强制注入；网页/自托管留空或设 `server`（代码仅识别 `server`/`desktop` 两值，`web` 不被识别）/ deploy mode: `desktop` injected by Electron main; leave empty or set `server` (code only recognizes `server`/`desktop`; `web` is not valid) |

> 全部变量以 `.env.example` / `.env` 为准。生产环境务必配置强随机 `AUTH_SECRET`。
> All vars follow `.env.example` / `.env`. Always set a strong random `AUTH_SECRET` in production.

---

## 部署到 Vercel / Deploy to Vercel

1. 在 Vercel 连接仓库 / Connect the repo in Vercel.
2. 在 Dashboard 配置上述环境变量（尤其 `AUTH_SECRET`、`CRON_SECRET`、`DATABASE_URL`）/
   Set the env vars above in the dashboard (esp. `AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL`).
3. 构建命令默认 `next build`，输出为 Node 服务端渲染（无需额外配置）/
   Default build is `next build`, output is Node SSR (no extra config needed).

部署时会读取 `.vercelignore`，仅上传构建所需文件，跳过测试与本地调试产物，减小上传体积：
Vercel reads `.vercelignore` and uploads only what the build needs, skipping tests and local debug artifacts:

- 忽略 / Ignored：`test/`、`e2e/`、`playwright-report/`、`test-results/`、`temp/`、`doc/`、本地 `.env`、调试文件。
- 保留 / Kept：`app/`、`lib/`、`db/`、`i18n/`、`messages/`、`public/`、配置与 `package*.json`。

`vercel.json` 已声明定时任务 / `vercel.json` declares the cron job：

```json
{ "crons": [ { "path": "/api/cron/cleanup-audit", "schedule": "0 16 * * *" } ] }
```

即每天 UTC 16:00 清理审计日志（由 `AUDIT_CLEANUP_MODE=cron` + `CRON_SECRET` 保护）。
Cleans audit logs daily at 16:00 UTC (guarded by `AUDIT_CLEANUP_MODE=cron` + `CRON_SECRET`).

> 安全响应头（CSP / HSTS / X-Frame-Options 等）在 `next.config.ts` 全站生效，生产环境收紧 `script-src`。
> Security headers (CSP / HSTS / X-Frame-Options …) are applied site-wide in `next.config.ts`; `script-src` is tightened in production.

---

## 技术栈 / Tech Stack

| 领域 Area | 选型 Choice |
|---|---|
| 框架 Framework | Next.js 16（App Router + Turbopack）、React 19.2 |
| 样式 Styling | Tailwind CSS 4 |
| 数据库 Database | Turso / libSQL（`@libsql/client` 0.15）+ Drizzle ORM 0.45 |
| 认证 Auth | Auth.js v5（next-auth 5.0.0-beta，JWT 由 `jose` 签发，适配 Vercel 无盘）+ bcryptjs + 自研 PNG 位图验证码 + IP 限流 |
| i18n | next-intl 4（cookie 优先、无路径前缀、语言配置数据库化；zh-CN / en / zh-TW） |
| 图表 Charts | ECharts 6（趋势折线 / 分类占比环形，客户端动态导入，SSR 安全） |
| Excel | `@e965/xlsx`（SheetJS，Apache 2.0） |
| 校验 Validation | Zod 3（环境变量启动校验 + 表单与列表筛选白名单/格式预校验） |
| 桌面 Desktop | Electron 37 + electron-builder 26（asar 打包 + asarUnpack 解压 standalone） |
| 测试 Testing | Node 内置 `tsx --test`（单元）+ Playwright（端到端） |

---

## 数据库设计 / Database（21 张表 / 21 tables）

```
users / ledgers / ledger_members / settings / currencies /
accounts / categories / tags / projects / transactions /
transaction_tags / holding_tags / audit_logs / balances /
recurring_plans / investment_holdings /
menu_groups / menus / user_menu_config / languages / user_profiles
```

核心口径 / Core rules：

- **金额存分 / Amounts in cents**：所有金额字段为整数 `*_cents`，前端仅负责展示与格式化；金额输入接受千分位逗号（如 `1,233.52`），解析时自动去除。
  All amount columns are integer `*_cents`; the front-end only formats for display. Amount input accepts thousands-separator commas (e.g. `1,233.52`), auto-stripped on parse.
- **余额不落库 / Balances not persisted**：账户只存 `opening_balance_cents`；当前余额 = 期初 + 流水增量（SQL 层按
  `账户 × 转入账户 × 类型` 聚合，聚合后行数 ≪ 流水总数）。
  Accounts store only `opening_balance_cents`; live balance = opening + aggregated tx.
- **多币种口径 / Multi-currency figures**：`accounts` / `transactions` / `balances` / `investment_holdings` 均带 `currency_code` 与原币 `amount_cents`/`cost_cents`/`current_value_cents` 等，并冗余存储基准币种分（`base_*_cents`，历史不可变，用于跨币种正确合计）；跨币种转账额外存 `to_currency_code` / `to_amount_cents` / `used_rate_from` / `used_rate_to`。报表与项目汇总统一按基准币种聚合，原币仅作附注。
  Each of accounts / transactions / balances / holdings carries a `currency_code` plus native `amount_cents`/`cost_cents`/`current_value_cents` and a denormalized base-currency cents (`base_*_cents`, immutable, for correct cross-currency aggregation); cross-currency transfers additionally store `to_currency_code` / `to_amount_cents` / `used_rate_from` / `used_rate_to`. Reports and project summaries aggregate in base currency; native amounts are shown as a footnote only.
- **账本隔离 / Ledger isolation**：业务表全部带 `ledger_id`，由 `scopeGuard` 强制校验，杜绝跨账本越权。
  Every business table carries `ledger_id`, enforced by `scopeGuard`.
- **投资计量 / Investment accounting**：买入即记转账（扣款账户 → 关联账户），净资产只补计「市值 − 成本 − 费用」，
  避免与账户余额重复计量；仅 `status = active` 计入；`investment_holdings` 可带 `project_id`，并计入 `projectSummary` 项目汇总（仅 `status=active`）。
  Buy = transfer (payment account → linked account); net worth adds only `market − cost − fee`; only `active` counts. `investment_holdings` may carry a `project_id` and roll into `projectSummary` (active only).
- **审计留痕 / Audit trail**：`withAudit()` 与业务写操作同事务；仅 C（新增）/ U（修改）/ D（删除）留痕，查询（R）不写日志。
  `withAudit()` runs in the same tx as writes; only C / U / D are logged, reads are not.
- **导航数据驱动 / Data-driven nav**：`menu_groups` + `menus` + `user_menu_config` 取代早期 `menu_config` JSON 列。
  Replaces the early `ledgers.menu_config` JSON column.
- **语言可运营 / Manageable languages**：`languages` 表管理启用/默认/排序/显示名；`user_profiles` 存个人偏好。
  `languages` governs enabled/default/sort/display; `user_profiles` holds personal prefs.

**自动建库 / Auto-create**：本地 `file:` 模式下（桌面 Electron 与本地 web dev 同口径），`instrumentation.ts` 在服务启动时调用 `lib/db/bootstrap.ts` 的 `ensureSchema()`，
先 `mkdirSync` 确保数据库父目录存在，再将本地库设为 WAL 模式（`PRAGMA journal_mode=WAL`，满足 Turso CLI / 嵌入式副本上传的 WAL 要求，并提升读写并发），
最后用 `CREATE TABLE IF NOT EXISTS` 幂等建全部 21 张表与索引；数据库文件在首个写操作时由 libsql 惰性创建。
Local `file:` mode (desktop Electron & local web dev alike) auto-creates the dir + tables via `ensureSchema()` (idempotent) and switches the DB to WAL (`PRAGMA journal_mode=WAL`); the DB file is lazily created by libsql on first write.

---

## 架构与代码组织 / Architecture

```
app/                        页面与路由（App Router）/ pages & routes (App Router)
  (app)/                    业务页面（需登录）/ protected pages
    dashboard/ add/ transactions/ accounts/ balance/ reports/ calendar/
    investments/            投资（stocks/funds/deposits/bonds/metals/real-estate/
                            digital-assets/collectibles/insurance/loans）
    protection/             保障汇总（储蓄型保险 + 公积金 + 养老金）
    projects/ categories/ tags/ recurring/ ledgers/ import/
    profile/                个人中心（资料 / 密码 / 我的菜单）
    settings/               全局设置（通用 / 用户 / 语言 / 菜单 / 菜单分组 / 币种 / 日志）
    components/             业务共享组件 / shared business components
  actions/                  服务端 actions（薄封装：守卫 + 当前账本 + revalidatePath；写逻辑见 lib/services）/ server actions (thin wrappers; write logic in lib/services)
  api/                      auth / captcha / export / import / cron
  login/ register/          登录 / 注册 / login / register
components/                 全局组件（currency-context / locale-switcher）
db/
  schema.ts                 21 张表定义（Drizzle）/ 21 tables (Drizzle)
  seed.ts                   种子主流程 / seed entry
  seeds/                    种子数据（accounts/categories/tags/projects/investments/
                            transactions/extra/types）
  init/                     初始化（语言 / 分类 / 默认数据）/ init (languages / categories / defaults)
  bootstrap.ts              ensureSchema（桌面态启动建库建表）/ schema bootstrap
electron/
  main.ts                   Electron 主进程：启动 standalone 子进程 + 窗口 + 数据路径 + 错误兜底 / Electron main
  build.mjs                 esbuild 打包主进程 / bundle main with esbuild
  copy-standalone.mjs       拷贝 standalone 静态资源 / copy standalone assets
i18n/                       next-intl 配置（routing / request / navigation / dict / themes / timezones）
lib/                        核心工具（按领域分包）/ core utils by domain
  services/                 业务写逻辑（CRUD + 校验 + 审计）：accounts / balances / categories / transactions / investments / ledgers / menus / settings / basics / admin / profile / recurring / guard
  queries/                  DB 查询：accounts / transactions / investments / dashboard / reports / basics / admin
  validators/               Zod 校验：transaction / auth
  db/                       client.ts（并发/超时/重试/日志增强）+ index.ts（Drizzle 实例）+ bootstrap.ts
  auth/                     captcha（PNG 位图渲染）+ rate-limit
  *.ts                      纯逻辑：money / env / settings / ledger / pagination / period / recurring / audit …
messages/                   语言包（zh-CN.json / en.json / zh-TW.json）
test/                       单元测试 + 测试用例文档 / unit tests + docs
e2e/                        Playwright 端到端 / Playwright E2E
types/                      类型扩展 / type extensions
build/                     桌面图标资源（icon.png / icon.ico，被 electron-builder 自动检测）/ desktop icon assets
public/                    静态资源（logo.png 等）/ static assets
```

代码约定 / Conventions：

- **注释双语 / Bilingual comments**：`lib/` 与 `db/` 下全部注释为「中文 / English」双语，降低跨语言维护成本。
  All comments under `lib/` and `db/` are bilingual (中文 / English).
- **查询层单一出口 / Single query entry**：统一从 `@/lib/queries` 导入（该入口再导出分包与纯逻辑，调用方零改动）。
  Import everything from `@/lib/queries`.
- **依赖单向 / Acyclic deps**：`dashboard → accounts / transactions / investments`，无循环依赖。
  `dashboard → accounts / transactions / investments`, no cycles.
- **逻辑分层 / Layered logic**：`app/actions` 仅做「守卫 + 当前账本 + revalidatePath」薄封装；业务写逻辑在 `lib/services`（CRUD + 校验 + 审计），查询在 `lib/queries`，三者单向、无循环。
  `app/actions` are thin wrappers (guard + current ledger + revalidatePath); write logic lives in `lib/services`, reads in `lib/queries` — one-directional, no cycles.
- **验证码零依赖 / Dependency-free captcha**：5×7 点阵字模 + 手写 PNG 编码，响应体只含像素，答案不以文本出现。
  5×7 bitmap font + hand-rolled PNG; the response is pixels only, the answer never appears as text.

---

## 国际化 / i18n

- **框架 / Framework**：next-intl 4。
- **路由策略 / Routing**：`localePrefix: 'never'`（基于 cookie `money_locale`，零 URL 变更）。
  Cookie-based `money_locale`, no URL change.
- **语言解析 / Resolution**：cookie 优先 → `languages.is_default` → `Accept-Language` 浏览器语言。
  cookie first → `languages.is_default` → `Accept-Language`.
- **语言配置数据库化 / DB-driven catalog**：`languages` 表存储启用/停用/默认/排序/显示名，管理员后台可运营。
- **翻译文件 / Messages**：`messages/zh-CN.json` / `messages/en.json` / `messages/zh-TW.json`（静态打包）。
- **格式化 / Formatting**：货币 / 数字 / 日期统一走 `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.DisplayNames`。
- **系统生成文案 / System-generated text**：业务自动记账产生的类目名、备注（如买入/卖出/派息、投资收益/投资亏损）按**默认语言**渲染并入库（属用户数据，不随查看者语言切换）；审计日志摘要（如 Sold/Matured investment position）按**查看者语言**渲染。
  Auto-generated categories/remarks (buy/sell/dividend, profit/loss) are rendered in the default locale and stored as user data (not viewer-language switched); audit-log summaries render in the viewer's locale.

### 新增语言操作清单 / Add a Language

按顺序修改以下 3 个位置，语言即可在界面出现（后台设置页可进一步启用/设默认）：
Edit these 3 spots in order; the language then appears in the UI (enable/set default later in admin):

| 步骤 Step | 文件 File | 操作 Action |
|---|---|---|
| 1 | `i18n/routing.ts` | 在 `locales` 数组追加新 code；import 对应 `messages/{code}.json`；加入 `dictionaries` 与 `localeLabels` |
| 2 | `messages/{code}.json` | 新建翻译文件（可先复制 `zh-CN.json` 作为骨架再精翻）/ new messages file (copy `zh-CN.json` as skeleton) |
| 3 | 数据库 `languages` 表 | 插入一行（code = 新 locale，`is_enabled = 1`）；或登录后台 → 设置 → 语言管理 添加 |

注意 / Notes：

- 步骤 1 是编译期必须，缺少任何一项会导致 TypeScript 报错或 next-intl 运行时报 `Missing locale`。
  Step 1 is a compile-time must; missing any part breaks the build or throws `Missing locale` at runtime.
- `messages/{code}.json` 的 key 结构应与 `zh-CN.json` 保持一致（缺失 key 运行时回退 defaultLocale）。
  Keep keys aligned with `zh-CN.json` (missing keys fall back to defaultLocale).
- 后台「语言管理」完成步骤 3 后可设默认/排序/显示名，无需重启服务。
  After step 3 you can set default/sort/display name in admin without restart.

---

## 功能模块 / Modules

| 模块 Module | 路径 Path | 说明 Description |
|---|---|---|
| 仪表盘 Dashboard | `/dashboard` | 资产总览 / 月度趋势 / 分类占比 / 近期流水 |
| 记一笔 Add | `/add` | 收入 / 支出 / 转账，支持多币种、标签、项目 |
| 流水 Transactions | `/transactions` | 列表 / 筛选 / 编辑 / 删除 / 导入入口 |
| 账户 Accounts | `/accounts` | 21 种账户类型（含「自定义」兜底），余额实时汇总 |
| 余额表 Balance | `/balance` | 期初 + 流水 = 当前余额，快照对账 |
| 报表 Reports | `/reports` | 6 维筛选 / 概览 / 分类 / 标签 / 项目 / 资产 |
| 收支日历 Calendar | `/calendar` | 按日展示收支 |
| 投资 Investments | `/investments` | 总览 + 10 类持仓子页（股票/基金/定期/国债/贵金属/不动产/数字资产/收藏品/储蓄型保险/借贷） |
| 保障 Protection | `/protection` | 储蓄型保险 + 公积金 + 养老金 + 社保汇总 |
| 项目 Projects | `/projects` | 项目（装修、旅行等）与预算；聚合关联投资持仓（投入成本 / 当前市值 / 收益，基准币种），含多币种时展示「原币组成」 |
| 分类 Categories | `/categories` | 收支分类管理 |
| 标签 Tags | `/tags` | 标签管理 |
| 周期计划 Recurring | `/recurring` | 定时收支模板（日/周/月/年） |
| 账本 Ledgers | `/ledgers` | 多账本切换 / 成员管理 |
| 导入导出 Import | `/import` | Excel 导入（收入/支出/转账，支持项目/标签/目标账户自动建并落库）/ 导出 / 行级报告 |
| 个人中心 Profile | `/profile` | 资料 / 修改密码 / 我的菜单 |
| 全局设置 Settings | `/settings` | 通用设置 / 用户 `/settings/users` / 语言 `/settings/languages` / 菜单 `/settings/menus` / 菜单分组 `/settings/menu-groups` / 币种 `/settings/currencies` / 日志 `/settings/logs` |
| 审计日志 Audit | `/settings/logs` | 操作留痕（C / U / D） |

---

## 测试 / Testing

```bash
npm test          # 单元测试（test/*.test.ts）：金额/校验/环境/分页/审计/账本/UI 渲染/项目汇总等
npm run test:e2e  # Playwright 端到端（e2e/*.spec.ts）
```

> 测试与端到端目录已在 `.vercelignore` 中排除，不会随部署上传。
> Tests and E2E are excluded in `.vercelignore` and are not uploaded with the deployment.

---

## 桌面模式（Electron）/ Desktop mode

同一套代码库可打包为 Electron 桌面应用，与网页形态复用同一份 `db/schema.ts` / `lib/queries` / `lib/services` / `lib/validators`：
The same codebase ships as an Electron desktop app, reusing `db/schema.ts` / `lib/queries` / `lib/services` / `lib/validators` with the web form.

- **运行形态 / Runtime**：Electron 壳 + 本地 Next 独立服务（`output:'standalone'`）；`electron/main.ts` 以子进程启动 `.next/standalone/server.js` 后 `loadURL`。动态路由 / Server Actions / 中间件 / Auth.js 全部照常，无需静态导出与 IPC 数据层。
  Electron shell + local Next standalone server; `electron/main.ts` spawns `server.js` as a child process.
- **数据文件位置 / Data location**：优先落在「RatCount.exe 同目录/data/ratcount.db」（便于随程序整体拷贝或放到 U 盘便携）；若该目录不可写（默认装到 `C:\Program Files` 且为非管理员），则自动回退到 `userData`（`%APPDATA%/RatCount/data/ratcount.db`），保证标准用户也能正常建库启动。也可将 `DATABASE_URL` 设为 `libsql:` 云端地址以切到 Turso（与 server 模式共用云端库）。
  Prefers exe-adjacent `data/ratcount.db`; falls back to `userData` when the install dir isn't writable (e.g. `C:\Program Files` without admin).
- **自动建库 / Auto-create**：首次启动由 `instrumentation.ts` → `ensureSchema()` 幂等建库建表（先建父目录，设为 WAL 模式，再 `CREATE TABLE IF NOT EXISTS`），无需 drizzle-kit 迁移文件。
  First launch auto-creates the DB (WAL mode) + all 21 tables via `ensureSchema()` (idempotent; no migration files needed).
- **定时任务 / Tasks**：无 Vercel 环境时，审计清理由服务进程内 `setInterval` 执行（复用 `lib/audit-cleanup.ts`），无需 Cron。
- **部署模式注入 / Deploy mode**：构建时 `build:desktop:next` 注入 `NEXT_PUBLIC_DEPLOY_MODE=desktop`；Electron 主进程启动子进程时也强制写入该环境变量，前端据此区分桌面/网页。
  `build:desktop:next` injects `NEXT_PUBLIC_DEPLOY_MODE=desktop`; Electron main also forces it on the child process.

### 应用图标 / App icon

图标放在 `build/`（由 `electron-builder.yml` 的 `buildResources: build` 自动检测，无需改 yml）：
Icons live in `build/`, auto-detected via `buildResources` (no yml change needed):

- `build/icon.png` — macOS / Linux 应用图标，以及 Windows 兜底源（建议 ≥256×256）。
- `build/icon.ico` — Windows 的 `.exe` 与 NSIS 安装器图标，**必须 ≥256×256**（多尺寸 256/48/32/16，256 为首帧）。
- `app/icon.png` — 浏览器标签页 favicon（Next.js App Router 约定，无需改代码）。
- `public/logo.png` — 网页界面 logo（如登录页顶部，用 `/logo.png` 引用）。

> 替换图标后务必删掉 `release/` 重新打包，否则旧图标被缓存；Windows 还会显示旧图标缓存，需刷新资源管理器图标缓存。
> After swapping icons, delete `release/` and rebuild; refresh the Windows icon cache too.

### 打包细节 / Packaging

`electron-builder.yml` 关键配置：
Key `electron-builder.yml` settings:

- `electronDist: node_modules/electron/dist` — 复用已安装的 Electron 运行时，跳过下载（避免 Windows 下解包 EPERM）。
  Reuse the locally installed Electron runtime; skips download (avoids Windows extract EPERM).
- `asar: true` + `asarUnpack: [".next/standalone/**", "**/node_modules/**"]` — 开启 asar 压缩，但把 standalone 服务及其依赖解压为真实文件。原因：`server.js` 启动时会 `process.chdir(__dirname)`，asar 虚拟路径无法 `chdir`。
  asar on, but unpack standalone + its deps as real files (server.js does `chdir(__dirname)`, which fails on asar virtual paths).
- 主进程 `serverEntry()` 在打包后优先指向 `app.asar.unpacked/.next/standalone/server.js`（真实路径），开发态 / 非 asar 回退 `app.getAppPath()`。
  `serverEntry()` prefers `app.asar.unpacked/.next/standalone/server.js` when packaged; falls back otherwise.

### 构建 / Build

```bash
npm run build:desktop   # 1) next build(standalone) 2) 补齐 static/public 3) esbuild 打包主进程 4) electron-builder
```

> 桌面模式下 `next.config.ts` 自动切换为 `output:'standalone'` + `images.unoptimized`；安全响应头两种模式一致（桌面同样运行真实 Node 服务）。
> Desktop mode auto-switches `next.config.ts` to `output:'standalone'` + `images.unoptimized`; security headers are identical (desktop also runs a real Node server).

### 本地启动（已构建）/ Run locally (built)

```bash
# 分步构建后直接运行（不重新打包安装包）
npm run build:desktop:next && npm run build:desktop:server && npm run build:desktop:main
npm run start:desktop            # = electron .，运行 .next/standalone 下的本地服务
# 或一键产出安装包：npm run build:desktop  →  release/RatCount-*-setup.exe
```

> `start:desktop` 直接运行 `electron .`；数据库优先写在 RatCount.exe 同目录的 `data/ratcount.db`，不可写时回退 `userData`。
> 切换数据库后端：启动前设 `DATABASE_URL=libsql://<db>.turso.io`（并 `TURSO_AUTH_TOKEN=...`）即连 Turso 云端。

### 开发模式（热重载）/ Dev mode

```bash
npm run dev:desktop   # next dev(:3000) + 子进程 electron，主进程经 DESKTOP_DEV_URL 直连开发服务器
```

> 开发态不启动 standalone 服务：主进程连接已运行的 `next dev`，业务代码改动即时热更新。需先 `npm install`（含 electron）。
> Dev mode connects to a running `next dev` for instant hot reload; requires `npm install` (incl. electron) first.

---

## 许可证 / License

本项目以 MIT 许可证开源 / Released under the MIT License.
