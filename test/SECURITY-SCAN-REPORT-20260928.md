# RatCount 安全扫描报告 / Security Scan Report

- 扫描日期 / Date：2026-09-28
- 范围 / Scope：RatCount 全项目（Next.js App Router + TypeScript，含投资/借贷/项目/账本/周期计划 + 桌面 Electron 构建）
- 方法 / Method：依赖漏洞扫描（npm audit，官方源）、静态代码审计（覆盖认证授权/注入/XSS/密钥/校验/敏感数据/CSRF·CORS/限流/上传/SSRF 等 11 类）、启动后动态探测（安全响应头 + 管理端点可达性）
- 结论 / Verdict：整体安全成熟度**高**；Web 托管侧未发现注入/IDOR/未授权 API/XSS 等高危及以上风险。需关注 1 项桌面会话伪造（高）、依赖 2 项高危（仅桌面构建）、若干中低项与 1 项动态确认的开放管理端点。

---

## 一、依赖漏洞扫描（npm audit）

> 注：项目镜像源（npmmirror）未实现 audit 接口，已改用官方源 `registry.npmjs.org` 完成。

| 包 | 严重度 | 说明 | 影响面 |
|---|---|---|---|
| `electron` ≤40.10.2（多个版本区间） | **High** | 30+ 条公告：AppleScript 注入、Service Worker 伪造 executeJavaScript IPC、权限源错误、UAF、注册表路径注入、HTTP 响应头注入等 | **仅桌面 Electron 构建**；Web 部署不捆绑 Electron |
| `extract-zip`（electron 依赖） | **High** | 未校验的符号链接路径穿越（任意文件写入） | 仅桌面构建（解压 Electron 资源时） |

- 修复：**[已修复 2026-09-28]** `electron` 已升级至 `^44.4.5`（实际 44.4.5），`extract-zip` 随之解决；`npm audit --registry=https://registry.npmjs.org` 现报 `found 0 vulnerabilities`。`electron-builder` 在 `^26` 范围内已解析到 26.17.0（支持 electron 44）。Web 部署不受此二项影响。注：npm 11 的 `allowScripts` 会拦截 electron 二进制下载脚本，需手动 `node node_modules/electron/install.js`（已执行，`dist/electron.exe` 就位），否则 `build:desktop` 会因缺二进制失败。

---

## 二、静态代码审计

### 高（High）

**H1. 桌面模式硬编码公开 `AUTH_SECRET` 兜底，可伪造管理员会话**
- 文件：`electron/main.ts:100`
- 代码：`AUTH_SECRET: process.env.AUTH_SECRET ?? "change-me-in-production-desktop-secret"`
- 风险：`lib/env.ts` 设计为"未设 AUTH_SECRET 时用随机 ephemeral 密钥、生产直接抛错"；但 Electron 主进程显式覆盖为该公开字面量，任何人可借 `jose` 自签 `role:admin` 的 `session-token` JWT 绕过 `tokenVersion`。
- 缓解：桌面服务仅绑 `127.0.0.1`，远程利用受限；本地攻击者需能向本机服务投递伪造 cookie。
- 修复：**[已修复 2026-09-28]** 移除硬编码字面量，改用 `randomBytes(32).toString("hex")` 进程级随机密钥（与 `lib/env.ts` 的 `ephemeralAuthSecret` 一致），缺失时打印警告；需重启后免登录则通过环境变量持久化强随机密钥。

### 中（Medium）

**M1. 导出 Excel 公式注入（Formula Injection）** — `lib/io/excel.ts:43-105`  **[已修复 2026-09-28]**
- `remark`/`name`/`tag` 等用户可控字符串直写单元格；以 `= + - @` 开头的内容在 Excel/WPS/Sheets 打开时会被当公式执行（数据外泄/RCE）。
- 修复：新增 `asTextCell()`（仅当首字符为 `= + - @ \t \r` 时前缀单引号强制文本），应用于流水/账户/分类/标签/项目全部用户输入字段；回归测试 `test/excel-formula-injection.test.ts`（3 项全过）。

**M2. 演示种子使用已知默认管理员口令** — `db/seed.ts:30-35`
- 生产被 `NODE_ENV==="production"` 门禁拦截，但误配时 `admin@example.com / demo1234` 会被建出且注册默认关闭、无其它建管途径。
- 修复：默认口令改强制读 `SEED_ADMIN_PASSWORD`，缺失即拒绝；README 醒目提示勿在非演示环境运行 `db:seed`。

**M3. Cron 清理端点在未设 `CRON_SECRET` 时完全开放** — `app/api/cron/cleanup-audit/route.ts:14-18`  **[已修复 2026-09-28]**
- `if (secret && …)`：未设 `CRON_SECRET` 时任何人可触发审计日志清理；且 `catch` 把 `String(e)` 回显内部异常（见 L5）。
- 修复：**[已修复]** `NODE_ENV=production` 时强制要求 `CRON_SECRET`（缺失或不匹配均 401）；非生产（dev/test）未设时保留本地 dry-run；任意环境设了该变量都必须校验 Bearer。回归测试 `S5-3`（新增）。**（动态扫描曾确认无密钥返回 200，现已收敛为生产 401）**

### 低（Low）

- **L1** 验证码 / locale Cookie 未设 `secure` — `lib/auth/captcha.ts`、`middleware.ts` **[已修复 2026-09-28]** 生产加 `secure`；验证码 cookie 本就 `httpOnly`。
- **L2** 主题 Cookie 仅客户端 `document.cookie` 写入、无 `httpOnly/secure` — `app/(app)/profile/profile-panel.tsx` **[已修复 2026-09-28]** 改为服务端 `setThemeCookie`（`app/actions/cookies.ts`）写 `HttpOnly`+`Secure`(生产)+`SameSite=Lax`；locale/timezone 客户端写亦在 HTTPS 下加 `secure`。
- **L3** 导入空工作簿时 `sheet_to_json(undefined)` 抛未捕获 500 — `app/api/import/route.ts` **[已修复 2026-09-28]** `SheetNames` 为空 → `400 emptySheet`；`sheet_to_json` 包 try/catch → `400 importFailed`。
- **L4** 解析不受信 xlsx 的解压炸弹防护偏弱 — `app/api/import/route.ts` **[已修复 2026-09-28]** 新增 `MAX_CELLS=1_000_000` 单元格总量上限（按 `!ref` 维度在解析前拦截），与行数上限、文件大小上限共同防护。
- **L5** 错误详情回显与详细服务端日志 — `app/api/cron/cleanup-audit/route.ts:25`、`lib/db/client.ts:72,76,88`；`[cron 路由回显已修复 2026-09-28]` 改为返回通用 `errors.internal`，详细异常仅留服务端 `console.error`；`lib/db/client.ts` 的服务端日志保持（不向客户端泄露）。
- **L6** 限流为单实例内存（`Map`）— `lib/auth/rate-limit.ts` **[已修复 2026-09-28]** 重构为异步可插拔存储：默认内存（行为不变），配置 `REDIS_URL` 后走 Redis 分布式限流（启用需 `npm i redis`，不可用/未配置自动回退内存）；`allowAttempt/remainingAttempts/resetAttempts` 均改为 `async`，登录/注册/导出/验证码调用点已 `await`，相关测试已同步异步化。

### 信息（Info / 设计确认）

- **I1** 审计日志含 PII（email/name/IP/请求体），仅 admin 可读/删（已校验），属预期设计。
- **I2** `LIKE '%q%'` 作为**绑定值**拼入 `like()`，已测试验证无注入；用户输入含 `% _` 会放大匹配，可加 `ESCAPE`。
- **I3** `middleware.ts` 排除 `/api`（符合预期）：所有 API 路由自行校验（`requireUser`+账本角色、`captcha` 公开且限流、`cron` 需 Bearer），未发现缺口。

### 明确「未发现」的项

- 认证授权：无未授权可访问的 API route / server action / 直读库；所有 `app/actions/*` 经 `requireUser/requireAdmin/requireLedgerAccess` 守卫，页面经 `(app)/layout.tsx` 与日志页 admin 门禁；管理类操作均限 admin/owner。
- 注入：全查询走 drizzle 参数化或 `sql\`\`` 模板；无 `db.query` 字符串拼接；`child_process` 仅 Electron 主进程 spawn 自身可执行（非用户输入）。
- XSS：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`（仅测试断言零使用）；React 默认转义。
- 密钥：仓库仅含 `.env.example`，`.env/*.local` 已 gitignore；无提交的真实密钥（命中项均为测试 fixture）。
- 输入校验：金额/ID/日期/枚举均有 zod 校验；`updateSettingService` 对 `key` 做 `SETTING_KEYS` 白名单。
- CSRF/CORS：会话 `SameSite=Lax` + Auth.js csrf + 服务端 Action 同源；无 `Access-Control-Allow-Origin:*` 或 CORS 放宽。
- 文件上传：上传文件仅入内存 `Buffer` 解析，不落盘、不拼用户路径；无路径穿越。
- SSRF/开放重定向：无基于用户输入的 `fetch`/`redirect`（唯一 `fetch` 在 Electron 轮询本机 `127.0.0.1` 自有服务）。

---

## 三、启动后动态扫描（Dynamic）

- 启动：`npm run dev --port 3200`（进程已停止）。
- `GET /` → **200**，应用可启动（本地文件 DB 正常）。
- 安全响应头（基线良好）：
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: SAMEORIGIN`、`Content-Security-Policy` 含 `frame-ancestors 'self'`、`object-src 'none'`（点击劫持/注入防护到位）
  - `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`
  - 注意：**dev CSP 含 `script-src 'self' 'unsafe-inline' 'unsafe-eval'`** —— `unsafe-eval` 会削弱 XSS 防护；需复核**生产构建**是否移除（Next dev 常见，生产通常无 `unsafe-eval`）。
- **确认 M3**：`GET /api/cron/cleanup-audit`（无 `CRON_SECRET`）→ **200**，返回 `{"ok":true,"days":90,"deleted":0}`，即端点无认证即可调用并执行清理（同时泄露保留天数配置）。

---

## 四、风险优先级与修复建议

1. ~~**[高] H1**：移除 `electron/main.ts` 硬编码 `AUTH_SECRET` 兜底。~~ **[已完成]**
2. ~~**[中] M3（已动态确认）**：生产强制 `CRON_SECRET`，缺失即 401；收敛错误回显（L5）。~~ **[已完成]**
3. ~~**[中] M1**：导出 Excel 对所有用户可控单元格做文本转义，阻断公式注入。~~ **[已完成]**
4. **[中] M2**：种子默认口令改强制环境变量；README 提示勿在生产跑 `db:seed`。
5. ~~**[低] L1/L2**：生产为验证码/locale/theme 等 cookie 统一加 `Secure`（验证码、主题加 `HttpOnly`）。~~ **[已完成]**
6. ~~**[低] L3/L4/L6**：导入空表保护、解析内存上限、限流分布式化（Redis/Vercel KV）。~~ **[已完成]**
7. ~~**[依赖] 高**：桌面构建将 `electron` 升级至 `44.4.5` 并回归（Web 不受影响）。~~ **[已完成]**
8. **[复查] CSP**：确认生产 CSP 移除 `unsafe-eval`/`unsafe-inline`。

---

## 五、局限说明 / Limitations

- 无专用渗透测试工具（如 ZAP/Burp/DAST），动态部分仅做可达性与响应头探测，未做载荷级利用验证。
- `npm audit` 经官方源完成；镜像源未实现 audit 接口。
- 桌面（Electron）运行时不单独启动探测，相关风险依据源码审计 + 依赖公告给出。
- 测试/审计类文件中的 `execSync`/`spawnSync` 不属运行时路径。
- 动态扫描产生的 `dev.log`/`dev.err` 因占用未能删除，可手动清理。
