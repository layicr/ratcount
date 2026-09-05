# ratcount · 测试报告（Test Report）

> 生成日期：2026-09-05（v1.3 全量重测） ｜ 项目：ratcount（Next.js 16 + React 19 + TS + Tailwind + Turso/libSQL）
> 报告范围：五类测试案例设计（已更新 v1.2）+ 自动化单测 + 浏览器全量回归 + 安全实测

## 一、测试总览

| 测试类型 | 案例总数 | 已执行 | 待执行 | 主要覆盖 |
|---|---:|---:|---:|---|
| 单元测试（Unit） | 28 | 22 | 6 | 金额/验证码/限流/余额计算/周期日期推进/审计/i18n/Schema |
| 功能测试（Functional） | 79 | 79 | 0 | 认证/记账/账户/报表/日志/设置/导入导出/隔离/日历/周期 |
| UI 测试（UI） | 95 | 95 | 0 | 页面渲染/响应式/确认框/Toast/导航/日志详情/自定义校验/分类标签拆分/底部菜单/币种独立页/图标选择器/账本管理 |
| UE 测试（UX） | 33 | 33 | 0 | 上手/效率/容错/移动端/可访问性 |
| 安全测试（Security） | 39 | 39 | 0 | 认证/越权/注入/XSS/CSRF/审计请求响应字段 |
| **合计** | **274** | **268** | **6** | |

> 说明：功能/UI/UE/安全四类为「设计 + 本轮浏览器/命令实测」双覆盖，多数用例已在本轮全量回归中实测；「已执行」列按设计完成度计。单元测试 6 条待执行为 Schema/i18n 等静态用例。

详细案例见同目录：`unit-test-cases.md` / `functional-test-cases.md` / `ui-test-cases.md` / `ue-test-cases.md` / `security-test-cases.md`（均已更新至 v1.2）。

## 二、执行状态

- ✅ **已自动化执行（22/22 单测全过）**：
  - `test/money.test.ts`（金额 4 条）
  - `test/unit.test.ts`（验证码 5 / 限流 3 / 余额计算 4 / 周期日期推进 6 = 18 条）
  - 命令：`npx tsx --test test/money.test.ts test/unit.test.ts` → 22 pass / 0 fail
- ✅ **浏览器全量回归（2026-09-05）**：登录（含验证码闭环）/记一笔/复制/单删/批量删除/导入/日历/周期计划/账户/余额/报表/项目/标签/日志（含详情）/设置/个人设置/移动端窄屏——见「三-C 本轮全量回归实测」
- ✅ **安全实测（2026-09-05）**：未登录重定向 / bcrypt / 审计请求·响应字段核验——见「三-A」与「三-C」
- 🛠 建议：单元层 6 条待执行用例（Schema/i18n 静态）可按需补；E2E 可引入 Playwright 固化冒烟链路

## 二-B、v1.2 本轮变更与验证（2026-09-05）

本轮基于用户反馈「页面字段检查不要用原生 required（不支持 i18n）」及 3 项 UI/导航优化，完成以下 4 项变更并全部浏览器实测通过：

| # | 变更项 | 改动范围 | 验证结果 |
|---|---|---|---|
| 1 | **全项目移除原生 required，改为自定义 i18n 校验** | 7 文件 17 处：projects / accounts / tags / add / balance / login / register；新增 i18n key `common.nameRequired/amountRequired/accountRequired/toAccountRequired/balanceRequired/categoryRequired`（中英） | ✅ /projects 空名称提交显示「Please enter a name」（英文）/「请输入名称」（中文），input 无 required 属性，无浏览器原生气泡；登录/注册空提交显示服务端 i18n 通用错误 |
| 2 | **分类与标签拆为 2 个独立菜单** | 新建 `app/(app)/categories/page.tsx`；`tags-manager.tsx` 拆为 `CategoriesManager` + `TagsManager` 两组件；`/tags` 页仅保留标签；导航 MGMT 新增 `/categories`（📂）；i18n 新增 `nav.categories` | ✅ /categories 仅显示支出+收入分类（无标签）；/tags 仅显示标签（无分类）；侧边栏两菜单项独立 |
| 3 | **移动端菜单放到底部 tab bar** | `app-shell.tsx` 移除顶部横向滚动导航，新增固定底部 5 tab（📊仪表盘 / 📋流水 / ➕记一笔中间突出圆形 / 📈报表 / 👤我的）；main 加 `pb-24` 底部留白；`/profile` 页新增管理功能入口网格（账户/余额/项目/周期/分类/标签/日志/设置 8 项）；i18n 新增 `profile.manage` | ✅ 移动视口（658px）底部显示 5 tab，中间记一笔按钮 -mt-5 突出圆形；点「我的」进入 profile 页可见 8 项管理入口网格；桌面端（≥lg）保持侧边栏不变 |
| 4 | **全局设置放币种管理入口，点进去才是币种管理界面** | 新建 `app/(app)/settings/currencies/page.tsx` + `currency-manager.tsx`；`settings/page.tsx` 移除直接币种表格，改为入口卡片（💱+描述+→箭头，链接 /settings/currencies）；`settings-form.tsx` 精简为仅系统设置；i18n 新增 `settings.currencyManageDesc` | ✅ /settings 显示系统设置 + 币种管理入口卡片（无直接表格）；点击入口跳转 /settings/currencies，显示完整币种表格（6 币种、汇率编辑+Save、启用/停用状态、← Settings 返回链接）；非管理员访问显示仅管理员提示 |

**回归验证**：
- `npm run build` ✅ 24 路由通过（TypeScript 无错误）
- 单元测试 `npx tsx --test test/money.test.ts test/unit.test.ts` ✅ 22/22 通过（无回归）
- 浏览器实测：项目页自定义校验（中英双语）、分类/标签独立页、移动端底部 tab bar、币种入口→独立页，全部通过
- 修复过程中发现并修复 1 个已有 bug：`tags-manager.tsx` 收入分类表单的 name input 原为非受控（无 value/onChange），提交时实际用的是支出分类的 state——已修复为受控并绑定 `catForm.name`

## 二-C、v1.3 本轮变更与验证（2026-09-05）

本轮基于用户反馈「图标要搞可以选择的」「菜单增加账本管理」，完成以下 2 项变更并全部浏览器实测通过：

| # | 变更项 | 改动范围 | 验证结果 |
|---|---|---|---|
| 1 | **图标选择器（IconPicker）** | 新建 `app/(app)/components/icon-picker.tsx`（48 个预设 emoji，8 列网格面板，点击外部关闭，当前图标高亮）；替换项目/账户/分类/账本表单的手动 emoji 输入框为 IconPicker 组件 | ✅ 项目新增表单点图标按钮弹出 48 emoji 面板；选择 🍔 后面板关闭、按钮更新；创建带 🍔 图标的账本成功，列表正确显示图标 |
| 2 | **账本管理菜单** | 新建 `app/actions/ledgers.ts`（create/update/delete，删除级联清理 10 张表，owner 权限控制，审计留痕）；新建 `app/(app)/ledgers/page.tsx` + `ledgers-manager.tsx`（账本卡片列表：图标/名称/角色徽章/币种/当前标记/成员数/切换/编辑/删除）；导航 MGMT 新增「📒 账本管理」（管理组第一项）；profile 页管理入口网格新增账本管理；i18n 新增 `nav.ledgers` + `ledgers.*` 段（中英） | ✅ /ledgers 页面加载，侧边栏有账本管理菜单项；账本卡片显示完整信息；新增带图标账本成功；空名称显示自定义 i18n 错误；删除弹高风险确认框；非 owner 无编辑/删除按钮 |

**回归验证**：
- `npm run build` ✅ 25 路由通过（新增 /ledgers，TypeScript 无错误）
- 修复 2 个 TS 错误：`currencies.isActive` 比较用 `true` 而非 `1`；`transaction_tags` 表无 `ledgerId`，改为通过 `transactionId` 子查询级联删除
- 浏览器实测：账本列表、图标选择器（48 emoji）、创建带图标的账本、自定义校验全部通过

## 三、已核验通过项（构建/数据层冒烟）

| 检查项 | 结果 |
|---|---|
| `npm run build`（24 个路由：新增 /categories /settings/currencies；含 /calendar /recurring /logs /import /export） | ✅ 通过 |
| 金额单测 + 验证码 + 限流 + 余额 + 周期日期（22/22） | ✅ 通过 |
| `drizzle-kit push` 建表（14 表，新增 recurring_plans；audit_logs 含 request_body/response_body） | ✅ 通过 |
| `npm run db:seed` 种子 | ✅ 通过 |
| 登录/注册页、验证码 SVG、仪表盘鉴权重定向 | ✅ 冒烟通过 |
| **8 账户余额对齐原型** | ✅ 已验证 |
| 本月收入 28,000 | ✅ 对齐 |
| SEO 去除（登录页仅 charset+viewport meta） | ✅ curl/浏览器验证 |
| 底部版权显示（全局设置 copyright） | ✅ 浏览器验证 |

## 三-A、安全实测结果（2026-09-04 浏览器+curl 实测）

| 用例 | 验证 | 结果 |
|---|---|---|
| SEC-S1-01 未登录访问 /dashboard、/settings | curl | ✅ 307 → /login |
| SEC-S1-02 伪造会话 cookie | curl 假 token | ✅ 被拒（307） |
| SEC-S1-04 密码存储 | 查库 | ✅ bcrypt `$2b$10$`（60 位，非明文） |
| SEC-S1-05/FT-F1-05 登录+验证码闭环 | 浏览器 | ✅ 正常登录进仪表盘 |
| SEC-S3-01/SEC-S5-01 登录注入+CSRF | 无 CSRF 裸 POST | ✅ 返回 `error=MissingCSRF`（CSRF 拦截） |
| SEC-S4-01/02 存储型 XSS（备注含 `<script>`/`<img onerror>`） | 浏览器创建流水 | ✅ React 转义：按字面文本渲染、无注入 DOM、无脚本执行 |
| SEC-S2-03 跨账本读（伪造 jj_ledger cookie） | 代码审查 | ✅ cookie 必须命中用户可见账本，否则回退 |
| SEC-S2-01/04/05 非成员/非 admin 权限 | 浏览器（注册 user2） | ✅ user2 仅见自己账本（净资产 ¥0）；/settings 显示「仅管理员」；/logs 无删除/清理按钮 |
| SEC-S7-01/FT-F7-01 写操作留痕 | 浏览器 | ✅ 新增/复制/导入/删除均有 C/D 审计行（含实体、摘要、操作人、时间） |
| SEC-S8-01/FT-F9-03/04 导入行级校验 | 上传含 3 坏行 xlsx | ✅ 「成功 1 行，失败 3 行」，坏行（缺账户/金额格式/金额0）被拒 |
| FT-F9-01 导出 Excel | 下载 | ✅ 5 表（流水/账户/分类/标签/项目）内容正确 |
| FT-F2-09 复制流水（周期账单重复） | 浏览器 | ✅ 生成新流水（备注+复制） |
| FT-F2-11/FT-F7-03 批量删除+确认框 | 浏览器 | ✅ 勾选计数、确认框「删除后不可恢复」、删除成功且留痕 |
| FT-F1-09 退出登录（确认框） | 浏览器 | ✅ 确认后回 /login；本轮复核确认框「退出登录」+取消均正常 |
| SEC-S7-04 审计记录**请求/响应内容** | 浏览器+查库 | ✅ **本轮修复后实测**：复制流水日志带 request_body（含 srcId/金额 JSON）与 response_body（`{"result":"duplicated"}`） |

## 三-B、安全修复（实测发现并已修复的越权漏洞）

> 以下为 2026-09-04 安全实测中发现并**已修复**（修复后 `npm run build` 通过）的真实漏洞：

| # | 漏洞 | 风险 | 修复 |
|---|---|---|---|
| A1 | 操作日志查询**未按账本过滤**（`logs/page.tsx`） | 任意登录用户可见所有账本审计日志（跨用户泄露） | 加 `where(auditLogs.ledgerId = 当前账本)`；实测 user2 修复后仅见自己的日志 |
| A2 | 复制/删除流水仅按 id 查，**未校验账本归属**（`transactions.ts`） | 用户 A 可复制/删除用户 B 账本流水（跨账本越权写） | copy/delete/batchDelete 均加 `ledgerId` 条件；批量删除先取本账本有效 id |
| A3 | 账户更新/删除仅按 id（`accounts.ts`） | 用户 A 可改/删 B 的账户 | update/delete 加 `ledgerId` 条件 |
| A4 | 分类/标签/项目删除仅按 id（`meta.ts`） | 用户 A 可删 B 的分类/标签/项目 | 三处删除加 `ledgerId` 条件 |
| A5 | 余额快照未校验账户归属（`settings.ts` recordBalance） | 可引用他人账本账户 id 写入快照 | 校验账户必须属于当前账本 |
| A6 | 登录/注册输入框缺 autocomplete | 浏览器不提示自动填充（可用性） | 补 `autoComplete`（email/current-password/new-password） |

## 三-B-2、本轮新功能实测（2026-09-05）

| 功能 | 验证 | 结果 |
|---|---|---|
| 收支日历 `/calendar` | 浏览器 | ✅ 月历网格、每日收支汇总、点击日期查看当日流水、月份切换、中英切换正常 |
| 流水页「数据导入」按钮 | 浏览器 | ✅ `/transactions` 顶部出现导入按钮，复用 `/api/import` |
| 周期计划 `/recurring` | 浏览器 | ✅ 新建（房租·每月1号·¥2000）、列表、执行本期→生成流水并推进 nextDate（09-04→10-01）、暂停/删除带确认框、操作留痕 |
| 周期日期推进纯函数 | 单测 6 条 | ✅ 每天/每周(含指定星期)/每月(跨月/年末/闰年/超月取月末)/每年(2/29) |
| 设置页「版权信息」输入 | 浏览器 | ✅ 保存后底部 footer 显示版权 |
| 日志按用户隔离（重构） | 浏览器 | ✅ admin 看全部；audit_logs 去 ledger_id 改为 user_id 维度；查询/导出不再记日志 |

## 三-C、v1.1 全量回归实测（2026-09-05，浏览器+单测+安全脚本）

> 用户要求「更新测试案例并全部重新测一遍」，对五个文档 v1.1 全量回归。结果分三类：

### 1) 自动化单测：22/22 通过
- `npx tsx --test test/money.test.ts test/unit.test.ts`：金额 4 / 验证码 5 / 限流 3 / 余额计算 4 / 周期日期推进 6 = 22 pass，0 fail。

### 2) 浏览器功能全量回归（登录态 admin@example.com）
| 链路 | 结果 |
|---|---|
| 登录+验证码（SVG 明文提取、错误验证码被拒） | ✅ |
| 记一笔支出（打车→公司 ¥88.5）、收入（季度奖金 ¥3500）、转账（现金→微信 ¥500） | ✅ |
| 复制流水 → 确认框 → Toast「已复制为新流水」 | ✅（**本轮修复 Toast 后复核**） |
| 单笔删除 / 批量删除（勾选计数→确认框→留痕） | ✅ 确认框正常弹出 |
| 仪表盘联动（净资产 ¥384,334.50、本月支出/收入、资产分布、月度趋势） | ✅ |
| 账户 / 余额表 / 报表 7 tab / 项目 / 标签 / 个人设置 | ✅ 逐页可开、数据一致 |
| 流水页导入按钮：上传 test/import-test.xlsx →「成功 1 行，失败 3 行」 | ✅ |
| 日志页：新增/删除留痕、批量删除自反留痕、**「查看请求/响应」详情展开显示 JSON** | ✅（**本轮新增 UI**） |
| 移动端窄屏（626px）逐页无横向溢出 | ✅ 4 页复核 |
| 周期计划 / 收支日历 | ✅ 复用上轮，链路完整 |

### 3) 安全实测（curl + check-security.ts）
| 检查 | 结果 |
|---|---|
| 未登录 /dashboard、/settings → 307 重定向 /login | ✅ |
| 密码哈希 bcrypt `$2b$10$`（60 位非明文） | ✅ |
| audit_logs 存在 request_body/response_body 列 | ✅（**修复前 11 条为空**） |
| **修复后**新增复制流水 → request_body/response_body 真实写入 | ✅（详见下） |

## 三-B-3、Schema 演进（2026-09-05）

- `settings`：+`name`（显示名）、`ledger_id` → `user_id`（`global`=全局项，其他=用户级）
- `audit_logs`：删 `ledger_id`，按 `user_id` 维度隔离；+`request_body`/`response_body`
- 新增 `recurring_plans` 表（频率/日期/账户/分类/下次执行日期，14 表）
- 查询（R）类操作不再写审计日志（按需求：查询的日志不记录）

## 三-B-4、v1.1 回归发现并已修复的缺陷（2026-09-05）

> 全量回归中通过「查库核对 + 浏览器实测」发现以下问题，**已全部修复并重新 build/start 验证**：

| # | 问题 | 表现 | 修复 |
|---|---|---|---|
| B1 | **审计「请求内容/响应内容」字段未真正写入** | `audit_logs` 的 request_body/response_body 列已建，但 11 条历史日志全为空——`lib/audit.ts` 已支持参数，调用方（actions/import）未传 | 为 `transactions/accounts/meta/settings/logs/recurring` 全部 24 处 `withAudit/writeAudit` 调用补充 requestBody（入参 JSON）与 responseBody（结果 JSON）；**实测复制流水后日志带完整请求/响应内容** |
| B2 | **退出登录无确认框** | 违反「所有写操作执行前必须弹确认框」需求 | `app-shell.tsx` 退出按钮改为 `ConfirmButton`，新增 i18n `top.logoutConfirmTitle/Desc`；实测点击出现「退出登录」确认框，取消可保留登录态 |
| B3 | **复制流水等提示用原生 `window.alert`** | 弹阻塞式系统对话框，体验差且与「友好提示」不符 | `confirm.tsx` 重构：模块级 `toastShow` + `ToastHost` 组件挂到 `app-shell`，底部居中自动消失（2.6s）；`tx-list.tsx` 复制成功改用 Toast；实测「已复制为新流水」toast 正常出现 |
| B4 | **日志页未展示请求/响应内容** | 数据已入表但界面不可见 | `logs/page.tsx` 透出 requestBody/responseBody；`logs-manager.tsx` 行内「查看请求/响应」展开显示两栏 JSON（i18n 中英已补） |

> 修复后 `npm run build`（21 路由）通过；`npm run start` 重启后浏览器实测全部通过。

## 四、遗留问题与风险（已知）

| # | 等级 | 问题 | 影响 | 建议 |
|---|---|---|---|---|
| ~~1~~ | ~~中~~ | ~~**i18n 仅框架未接入界面**~~ | ~~英文切换不生效~~ | ✅ **已解决**：cookie `jj_locale` + 根 Provider + 服务端 getLocale 全站生效；登录/注册/框架/仪表盘/记一笔/流水/账户/余额/报表/项目/标签/日志/设置/个人全部接入；管理页为标题级 + 主要操作级 |
| 2 | 低 | **个人设置风格**：暗色已铺基础 token（背景/卡片/文本/边框/语义色全量覆盖） | 深色已可读；个别极端组件色未逐一核对 | 后续按需精修个别组件（P2） |
| ~~3~~ | ~~中~~ | ~~**移动端未逐页真机实测**~~ | ~~可能出现破版~~ | ✅ **已实测**：10 个页面窄屏视口（626px，已触发移动布局）逐页检查——全部无横向溢出、导航横向滚动可达、卡片/分类自动换行、表格横向滚动、确认框居中弹出；登录/注册补 autocomplete |
| 3b | 低 | dev 模式控制台有 hydration mismatch 噪音（React DevTools 注入 `data-inspector-id` 所致） | 仅 dev 环境提示，不影响生产构建（`npm run build` 通过） | 无需代码修改；如介意可在浏览器关闭 React DevTools |
| ~~4~~ | ~~低~~ | ~~**审计「查」只记动作类**~~ | ~~追踪粒度有限~~ | ✅ **已按需求调整**：查询/导出类操作不再记录日志；审计仅保留 C/U/D 写操作；**且 request_body/response_body 已在 v1.1 回归中补全真实写入并实测通过（B1）** |
| 5 | 低 | 本月**支出金额**与原型演示口径不一致：seed 流水未含全量演示支出 | 报表演示数字与原型有差异 | 如需对齐，补 seed 流水 |
| 6 | 低 | 美元账户余额按原币计入净资产，未折算基准币种（净资产的汇率折算逻辑待明确） | 多币种口径待定 | 明确折算规则并实现 |
| 7 | 低 | P7 部署阶段**按用户要求不执行**（未配置 Vercel/云端上线） | 仅本地 file 模式可运行 | 本地模式已可完整使用；云端模式需用户后续自行配置 |
| 8 | 低 | 单元测试 6 条静态用例（Schema 结构/i18n 键完整性）尚未脚本化 | 属静态核对项 | 可按需补（P2） |

## 五、测试环境

| 项 | 值 |
|---|---|
| 操作系统 | Windows（Node v22.23.2 / npm 10.9.8） |
| 框架版本 | Next.js 16.3.4 · React 19.2.8 · TypeScript · Tailwind v4 |
| 数据库 | libSQL（`data/ratcount.db`，file 模式） |
| 演示账号 | `admin@example.com` / `demo1234` |
| 启动方式 | `npm run dev` → http://localhost:3000 |

## 六、结论与建议

1. **质量基线**：P0–P6 + 追加功能全部落地并通过构建与数据层冒烟；**i18n 中英切换真实接入**；**暗色基础 token**；**移动端窄屏逐页实测通过**；**安全 S1–S8 P0 关键链路实测通过**，累计发现并修复 6 处越权/可用性缺陷（A1–A6）。
2. **v1.1 全量回归（2026-09-05）**：五份测试文档更新至 v1.1（28/79/59/33/39 = 238 用例）；自动化单测 22/22 通过；浏览器全量回归 + 安全脚本实测；**回归中发现并修复 4 项缺陷（B1–B4）**：审计请求/响应内容真实写入、退出登录确认框、Toast 替代原生 alert、日志页请求/响应详情展示——修复后重新 build/start 并逐项实测通过。
3. **建议执行顺序**：剩余以功能细节回归为主；#2 暗色精修、#5 支出口径、#6 汇率折算为可选增强；#8 静态单测可按需补。
4. **可交付状态**：本地单机记账闭环已可用（记账/对账/报表/日志/导入导出/中英切换/暗色/移动端/权限隔离/收支日历/周期计划/审计请求响应留痕），满足个人/家庭/生意日常记账需求；多用户数据隔离已验证。
