# ratcount · 个人/家庭/生意记账系统

> Next.js 16 + React 19 + TypeScript + Tailwind CSS + Turso(libSQL) 双部署
> 界面干净 · 功能全免费 · 逻辑简洁 · 数据自主可控

## 运行

```bash
npm install          # 安装依赖（已完成）
npm run db:seed      # 初始化演示数据（已完成）
npm run dev          # 启动开发服务器 → http://localhost:3000
```

演示账号：`admin@example.com` / `demo1234`（登录页含图形验证码，点击图片可刷新）

## 双部署

仅切换一个环境变量即可在本地 SQLite 与 Turso 云端之间切换（见 `.env.example`）：

| 模式 | DATABASE_MODE | 说明 |
|---|---|---|
| 本地 | `file` | 默认；数据落在 `data/ratcount.db`，零配置 |
| 云端 | `libsql` | 需 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` |

完整变量与默认值见 `.env.example`。除上表外，还支持数据库健壮性覆盖：`DB_CONCURRENCY`（驱动层并发上限，默认 20）、`DB_STATEMENT_TIMEOUT_MS`（单条语句软超时，默认 5000）、`DB_MAX_RETRIES`（瞬时错误重试次数，默认 3）、`DB_RETRY_BASE_DELAY_MS`（重试退避基数，默认 200）。`AUTH_SECRET` 必须 ≥16 位（生产建议 32 位以上强随机值）；缺失时开发/测试环境回退默认值并打印警告，生产环境启动直接报错。所有变量在启动时由 `lib/env.ts` 用 Zod 统一校验。

## 技术栈

- **框架**：Next.js 16（App Router + Turbopack）
- **数据库**：Turso / libSQL（`@libsql/client`），Drizzle ORM
- **认证**：Auth.js v5（JWT 策略，适配 Vercel 无盘）+ 自研 SVG 验证码 + IP 限流
- **i18n**：轻量字典（`messages/zh.json` / `messages/en.json`）
- **Excel**：SheetJS（`xlsx`，Apache 2.0）
- **图表**：ECharts 5（报表趋势折线 / 分类占比环形图，客户端动态导入，SSR 安全）
- **校验**：Zod（环境变量启动校验 + 表单与列表筛选的白名单/格式预校验）
- **测试**：`npx tsx --test test/*.test.ts`（金额纯函数）

## 数据库（14 张表）

`users` / `ledgers` / `ledger_members` / `settings` / `currencies` / `accounts` /
`categories` / `tags` / `projects` / `transactions` / `transaction_tags` /
`audit_logs` / `balances` / `recurring_plans`

核心口径：金额存分（`*_cents`）、账户余额不落库（期初+流水实时汇总）、
业务表全带 `ledger_id` 隔离、审计 `withAudit()` 同事务、转账不计收支、
查询（R）类操作不写审计日志（仅 C/U/D 留痕）。

## 实施进度

- [x] **P0 脚手架**：Next.js 16 初始化、目录结构、i18n 框架、安全基线
- [x] **P1 数据层**：14 张表 Schema、迁移、种子数据、金额纯函数 + 单测（金额 4 + 验证码/限流/余额/周期日期 18 = 22/22）
- [x] **P2 认证隔离**：Auth.js + 登录/注册 + 验证码 + bcrypt + 限流 + 首用户自动 admin
- [x] **P3 账本隔离**：ledgers/members + scopeGuard 强制隔离 + 多账本切换
- [x] **P4 核心记账**：记一笔/流水/账户/分类标签项目/报表 7 维/仪表盘/余额表/收支日历
- [x] **P5 全局设置与日志**：settings（名称/版权/语言/注册/验证码/日志天数/币种）/审计日志（含请求/响应、用户隔离）/个人设置/移动端/周期计划
- [x] **P6 数据导入导出**：Excel 导出/导入/行级报告/流水页导入按钮
- [ ] **P7 部署上线**：Vercel 云端模式（按需求明确**不执行**）

## 目录结构

```
app/            页面与路由（login/register/dashboard/api/...）
db/             Drizzle schema + seed
lib/            客户端、金额、设置、认证（验证码/限流）、i18n
messages/       zh/en 语言包
test/           纯函数单测
types/          类型扩展
prototype/      高保真交互原型（ui-prototype.html）
```
