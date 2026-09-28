# 固收利率按 30/360 自动计算（2026-09-28）

## 背景 / Background

`/investments` 的固收类持仓（定期 / 国债 / 储蓄型保险）已支持录入「利率」，但其仅作文本存储，且既有计息口径为 **ACT/365**（÷365），只被「到期兑付弹窗」用于预填利息。本次需求：

- 计息基准统一改为 **30/360**（年化，月 30 天、年 360 天）。
- 建仓表单实时预览「预计到期利息 / 到期总额」。
- 到期兑付、派息弹窗按 30/360 自动带出利息（可手改）。
- 利率字段标签由「利率」改为「利率（%）」（三语）。
- 借贷（loan）本次不动，沿用 ACT/365 口径。

## 口径确认 / Convention

- **到期弹窗利息 = 应计到今天**（沿用 `estimateAccruedCents` 现有行为：未到期算到今天，到期日已过按到期日），仅把 ÷365 换成 30/360。
- **建仓表单预览 = 满期投影**（本金 → 到期日，按 30/360），与弹窗"算到今天"口径不同但用途一致，均为 30/360。

## 改动清单 / Changes

| 文件 | 改动 |
|---|---|
| `lib/investment-flow.ts` | 新增 `days360`（30/360 天数）与 `DayCountBasis`；`calcMaturityCents` / `estimateAccruedCents` / `defaultMaturityCents` 增加 `basis` 参数（默认 `'365'`，零回归）；新增 `estimateMaturityPreview`（满期利息/总额，供建仓预览） |
| `app/(app)/components/investment-form.tsx` | `isFixedIncome && !isLoan` 下新增只读「预计到期利息 / 到期总额」满期预览（30/360） |
| `app/(app)/components/investment-list-client.tsx` | 到期弹窗 `estimateAccruedCents` 传 `basis`（固收 360 / loan 365）；`InvestmentDividendButton` 新增 `interestRate/purchaseDate/costCents` 入参，固收（非 loan）按 30/360（起息→今天）预填派息金额 |
| `app/(app)/components/investment-type-table.tsx` | 向 `InvestmentDividendButton` 透传 `h.interestRate/h.purchaseDate/h.costCents`；估值列两处 `estimateAccruedCents` 传 `basis='360'`，与弹窗口径一致 |
| `messages/zh-CN.json` / `en.json` / `zh-TW.json` | `investment.interestRate` →「利率（%）」/「Interest rate (%)」；新增 `investment.estInterest` / `investment.maturityTotal` |
| `test/investment-flow.test.ts` | 新增 `days360`、basis 对照、满期预览单测 |
| `test/functional-test-cases.md` | 新增 F16 固收利率 30/360（4 项），合计 93 → 97 |
| `test/ui-test-cases.md` | 新增 UI22 固收利率 30/360（4 项），合计 67 → 71 |

## 验证 / Verification

- `npm run typecheck` 通过。
- `npx tsx --test test/investment-flow.test.ts`：30/360 天数、basis 对照（固收 360 / 借贷 365 默认）、满期预览均通过；既有 ÷365 用例因 `basis` 默认 365 无回归。
- `npm test` 全量通过（i18n 三语键齐备，一致性校验通过）。

## 已知局限 / Limitations

- 派息预填起点为「起息日 → 今天」；多次派息场景系统未记录上次派息日，用户需手改金额。
- 30/360 为简化计息（日端取 min(day,30)），仅用于利息估算，误差业务可接受。
- 借贷（loan）建仓表单仍显示利率字段（历史行为），但本次预览/派息预填已显式排除 loan。
