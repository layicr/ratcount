# ratcount · 单元测试案例（Unit Test Cases）

> 版本：v1.1 ｜ 范围：纯函数与逻辑层 ｜ 语言：TypeScript
> 执行方式：`npx tsx --test test/money.test.ts test/unit.test.ts`（自动化 22 条，全部通过）

## 一、概述

单元测试聚焦**不含数据库与网络 IO 的纯逻辑**，保证金额换算、验证码、限流、余额计算、周期日期推进等基础正确性。当前自动化覆盖：`test/money.test.ts`（4 条）+ `test/unit.test.ts`（18 条）= **22/22 通过**。

## 二、被测模块清单

| 模块 | 文件 | 状态 |
|---|---|---|
| 金额工具 | `lib/money.ts` | ✅ 已自动化 4/4 |
| 验证码 | `lib/auth/captcha.ts` | ✅ 已自动化 5/5 |
| 登录限流 | `lib/auth/rate-limit.ts` | ✅ 已自动化 3/3 |
| 余额增量计算 | `lib/queries.ts` `computeBalanceDelta` | ✅ 已自动化 4/4 |
| 周期日期推进 | `lib/recurring.ts` `nextRecurringDate` | ✅ 已自动化 6/6 |
| 审计事务 | `lib/audit.ts` `withAudit` | ⏳ 待自动化（需内存库） |
| i18n 字典 | `messages/zh.json` / `en.json` | ⏳ 待自动化 |
| Schema 约束 | `db/schema.ts` | ⏳ 待自动化（drizzle-kit push 校验） |

## 三、用例明细

### M1 金额工具（lib/money.ts）— 已执行 4/4 ✅

| 用例ID | 描述 | 输入 | 预期结果 | 优先级 |
|---|---|---|---|---|
| UT-M1-01 | 元转分（整数） | `yuanToCents("12.34")` | `1234` | P0 |
| UT-M1-02 | 元转分（非法） | `yuanToCents("abc")` | `null` | P0 |
| UT-M1-03 | 分格式化千分位 | `formatCents(1234567)` | `"12,345.67"` | P0 |
| UT-M1-04 | 币种换算 | `convertCents(1000, 7.2, "CNY→USD")` | `≈ 13889`（1000 元 ÷ 7.2 = 138.89 美元分） | P1 |

> 补充建议用例（待自动化）：
> - `yuanToCents("")` / `yuanToCents("0")` / `yuanToCents("1,000.5")`（千分位容错）
> - `formatCents(0)` → `"0.00"`；`formatCents(-500)` → `"-5.00"`
> - 极端：超大金额、负数、浮点精度（`0.1+0.2` 场景）

### M2 验证码（lib/auth/captcha.ts）— 已执行 5/5 ✅

| 用例ID | 描述 | 输入/操作 | 预期结果 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| UT-M2-01 | 验证码长度与字符集 | `generateCaptchaCode()` | 4 位，仅含安全字符集（无 0/O/1/I） | P0 | ✅ `unit.test.ts` |
| UT-M2-02 | 排除易混淆字符 | 多次生成收集 | 不含 `0/O/1/I`，字符集正则校验 | P1 | ✅ `unit.test.ts` |
| UT-M2-03 | 随机性 | 50 次生成 | 取值不恒定（>1 种） | P0 | ✅ `unit.test.ts` |
| UT-M2-04 | 签名与校验 | `createCaptchaToken` + `verifyCaptchaToken` | 正确/小写/首尾空格均通过，错答拒绝 | P0 | ✅ `unit.test.ts` |
| UT-M2-05 | 伪造/篡改 token | 篡改 token 或非法 JWT | 校验失败 `false` | P0 | ✅ `unit.test.ts` |
| UT-M2-06 | SVG 结构 | `renderCaptchaSvg("K2M9")` | 含 `<svg`、每个字符一个 `<text>` | P2 | ✅ `unit.test.ts` |
| UT-M2-07 | 一次性消费 | 同一 token 校验两次 | 第一次 `true`，第二次 `false`（cookie 层消费，纯函数层不消费） | P0 | ⏳ 待浏览器实测 |

### M3 登录限流（lib/auth/rate-limit.ts）— 已执行 3/3 ✅

| 用例ID | 描述 | 输入/操作 | 预期结果 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| UT-M3-01 | 触发锁定 | 同 key 连续 5 次失败 | 第 6 次被拒 | P0 | ✅ `unit.test.ts` |
| UT-M3-02 | 剩余次数递减 | 失败后 `remainingAttempts` | 5→4→…→0 | P1 | ✅ `unit.test.ts` |
| UT-M3-03 | 成功后重置 | `resetAttempts` | 恢复 5 次可用 | P0 | ✅ `unit.test.ts` |
| UT-M3-04 | IP 独立 | 两个不同 key | 互不影响 | P0 | ✅ `unit.test.ts` |
| UT-M3-05 | 窗口过期 | 模拟超 15 分钟 | 计数清零 | P1 | ⏳ 需时间模拟 |

### M4 余额增量计算（lib/queries.ts computeBalanceDelta）— 已执行 4/4 ✅

| 用例ID | 描述 | 输入 | 预期结果 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| UT-M4-01 | 收入 | `[{type:"income",amountCents:10000}]` | a:+10000 | P0 | ✅ `unit.test.ts` |
| UT-M4-02 | 支出 | `[{type:"expense",amountCents:3000}]` | a:-3000 | P0 | ✅ `unit.test.ts` |
| UT-M4-03 | 转账 | `[{type:"transfer",accountId:a,toAccountId:b}]` | a:-、b:+ | P0 | ✅ `unit.test.ts` |
| UT-M4-04 | 转账不增减总资产 | 同上 | a+b 合计=0 | P0 | ✅ `unit.test.ts` |
| UT-M4-05 | 空/null 边界 | 空数组 / accountId=null | 无副作用，安全跳过 | P1 | ✅ `unit.test.ts` |

### M4B 周期日期推进（lib/recurring.ts nextRecurringDate）— 已执行 6/6 ✅

| 用例ID | 描述 | 输入 | 预期结果 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| UT-M4B-01 | 每天 | `("daily","2026-09-30")` | `2026-10-01`（跨月） | P0 | ✅ `unit.test.ts` |
| UT-M4B-02 | 每周 | `("weekly","2026-09-05")` | `2026-09-12`（+7 天） | P0 | ✅ `unit.test.ts` |
| UT-M4B-03 | 每周指定星期 | `("weekly","2026-09-05",{dayOfWeek:1})` | 跳到 09-07（周一） | P0 | ✅ `unit.test.ts` |
| UT-M4B-04 | 每月指定号数 | `("monthly","2026-01-15",{dayOfMonth:15})` | `2026-02-15`；跨年 12-10→次年 01-10 | P0 | ✅ `unit.test.ts` |
| UT-M4B-05 | 每月超月取月末 | `("monthly","2026-01-31",{dayOfMonth:31})` | 2 月无 31 → 02-28；2028 闰年 → 02-29 | P0 | ✅ `unit.test.ts` |
| UT-M4B-06 | 每年 | `("yearly","2026-09-05")` | `2027-09-05`；2/29→2/28 | P0 | ✅ `unit.test.ts` |

### M5 审计事务（lib/audit.ts withAudit）— 待自动化 ⏳（需 SQLite 内存库）

| 用例ID | 描述 | 操作 | 预期结果 | 优先级 |
|---|---|---|---|---|
| UT-M5-01 | 业务成功写日志 | `withAudit(..., tx=>insert)` | 业务行 + 日志行同时存在 | P0 |
| UT-M5-02 | 业务失败回滚 | 回调抛错 | 无业务行、无日志行（同事务） | P0 |
| UT-M5-03 | 字段落库 | 传入 ledgerId/entityId/summary | 对应字段正确写入 | P1 |

### M6 i18n 字典（messages/*.json）— 待自动化 ⏳

| 用例ID | 描述 | 操作 | 预期结果 | 优先级 |
|---|---|---|---|---|
| UT-M6-01 | 键一致性 | 对比 zh/en 的 key 集合 | 完全一致 | P0 |
| UT-M6-02 | 无空值 | 遍历所有 value | 非空字符串 | P1 |
| UT-M6-03 | 程序名 | 读取 `appName` | zh=`ratcount` / en=`RatCount` | P1 |

### M7 Schema 约束（db/schema.ts）— 待自动化 ⏳

| 用例ID | 描述 | 操作 | 预期结果 | 优先级 |
|---|---|---|---|---|
| UT-M7-01 | balances 唯一约束 | 重复插入同(ledger,account,date) | 抛唯一冲突 | P0 |
| UT-M7-02 | 枚举校验 | 插入非法 `type` | 抛约束错误 | P1 |
| UT-M7-03 | 金额非负/整数 | 插入负金额 | 业务层拒绝（zod/校验） | P1 |

## 四、执行状态汇总

| 优先级 | 已执行 | 待执行 |
|---|---|---|
| P0 | 15 | 4 |
| P1 | 6 | 2 |
| P2 | 1 | 0 |
| **合计** | **22** | **6** |

> 已执行项见 `test/money.test.ts`（4 条）+ `test/unit.test.ts`（18 条），运行命令：
> `npx tsx --test test/money.test.ts test/unit.test.ts`（22/22 通过）
> 待执行项：M5 审计事务（需 SQLite 内存库）、M6 i18n 键一致性、M7 Schema 约束、M2-07 验证码一次性消费（浏览器实测）等。
