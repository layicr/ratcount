# 借贷管理 · 借出收款修正（2026-09-25）

## 概述

借贷管理（`/investments/loans`）的「借出」持仓，其收款动作此前复用通用的「卖出 / 到期兑付」路径（`sellInvestmentService` 通用分支）。由于借出持仓 `quantity = 0`，`prorateSell` 始终 `isFull = true`，导致：

- **部分收款不支持**：即使只收回部分本金，转账仍按**全额本金**回笼、持仓直接标记 `matured`，且 `profit = 到账 − 全额本金` 会被记成大额「亏损支出」——记错。
- 弹窗虽分了「本金 / 利息」两栏，但通用路径**忽略** `principalYuan / interestYuan`，利息按「总额 − 全额成本」反推，口径失真。
- 借出按钮文案显示为「到期」，语义不清。

本次将「借出收款」抽成与「借入还款」对称的独立路径，并修正利息方向（借出利息应为**收入**）。

## 改动清单

| 文件 | 改动 |
|---|---|
| `lib/services/investments.ts` | `sellInvestmentService` 新增 `isLend` 分支：本金转账回笼借出资产（`investment.lendCollectRemark`）；利息记**收入**（投资收益，`investment.lendInterestRemark`）；收款手续费记现金支出（`investment.lendFeeRemark`）；支持部分收款（剩余本金递减、未结清保持 active）；超额收款拦截 `investment.collectPrincipalExceed` |
| `app/(app)/components/investment-list-client.tsx` | 借出按钮文案由「到期」改为「收款」（`investment.collect`），弹窗标题/描述用 `collectTitle` / `collectDesc` |
| `messages/zh-CN.json` / `zh-TW.json` / `en.json` | 新增 `investment.collect` / `collectTitle` / `collectDesc` / `collectPrincipalExceed` / `lendCollectRemark` / `lendInterestRemark` / `lendFeeRemark` 及 `audit.investmentCollected`（三语） |
| `test/investment-lend-collect.test.ts` | 新增借出收款对称测试（4 项，镜像借入还款测试） |
| `test/functional-test-cases.md` | 新增 F15 借出收款（利息记收入 + 部分收款）用例，汇总合计 89 → 93 |
| `test/ui-test-cases.md` | 新增 UI21 借贷管理（借出收款按钮 / 弹窗）用例，汇总合计 63 → 66 |

## 记账口径（借出）

- 本金收款：转账 **借出资产账户 → 收款现金账户**，借出资产按收回本金递减。
- 利息收款：收款现金账户**收入**（投资收益，增加净资产）。
- 全额收清：借出资产归零、持仓 → `matured`；部分收款：资产递减、保持 `active`。
- 超额收款（本金 > 剩余借出本金）：拦截，持仓 / 流水不变。

## 验证

- `npm run typecheck`：通过。
- 借出收款测试 `npx tsx --test test/investment-lend-collect.test.ts`：`4 pass / 0 fail`。
- 借入还款测试 `test/investment-borrow-repay.test.ts`：仍 `4 pass / 0 fail`（无回归）。
- 全量测试 `npm test`：`323 pass / 0 fail`。
