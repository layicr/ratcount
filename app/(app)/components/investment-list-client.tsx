"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteInvestment, sellInvestment, dividendInvestment, copyInvestment } from "@/app/actions/investments";
import { DeleteButton, ConfirmButton } from "./confirm";
import { InvestmentActionDialog } from "./investment-action-dialog";
import { METAL_SUB_TYPES, displayToQuantity, quantityToDisplay, isFixedIncome } from "@/lib/investment-types";
import { INV, type InvestmentType } from "@/lib/constants";
import { actualCostCents, estimateAccruedCents } from "@/lib/investment-flow";

/** 分 → 元（弹窗回填用，不带千分位） */
const toYuan = (cents: number) => (cents / 100).toFixed(2);

/** 删除按钮：二次确认后软删除 */
export function InvestmentDeleteButton({ id, type, name }: { id: string; type: string; name: string }) {
  const t = useTranslations();
  return (
    <DeleteButton
      action={async () => { await deleteInvestment(id, type); }}
      title={t("investment.delTitle")}
      desc={t("common.delDesc", { name })}
      okText={t("common.delete")}
      label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
    />
  );
}

/** 复制按钮：二次确认后生成一条同源新持仓（含买入流水、标签复制、审计） */
export function InvestmentCopyButton({ id, type, name }: { id: string; type: string; name: string }) {
  const t = useTranslations();
  return (
    <ConfirmButton
      action={async () => { await copyInvestment(id, type); }}
      title={t("investment.copyTitle")}
      desc={t("investment.copyDesc", { name })}
      okText={t("common.copy")}
    >
      <span className="text-xs text-teal-600 hover:underline">{t("common.copy")}</span>
    </ConfirmButton>
  );
}

/**
 * 卖出 / 到期按钮
 *  - 到期类（定期 / 国债 / 借贷 / 储蓄型保险）按利率自动算「本金 + 应计利息」，弹窗内分两栏可改
 *  - 可数量化持仓（股票/基金/数字资产/收藏品/贵金属）支持按数量部分卖出，默认金额取当前市值
 *  - 服务端采用拆分记账：成本按比例转回 + 盈亏单独记，收益才能进净资产
 */
export function InvestmentSellButton({
  id, type, name, costCents, feeCents, quantity, currentValueCents, interestRate, purchaseDate, maturityDate, isFixed, direction, tags, paymentAccountId, accounts, currencyCode,
}: {
  id: string;
  type: InvestmentType;
  name: string;
  costCents: number;
  feeCents: number;
  /** 持仓数量（原始存储口径；0 = 无数量口径，如定期/不动产） */
  quantity: number;
  currentValueCents: number;
  interestRate: string | null;
  purchaseDate: string | null;
  maturityDate: string | null;
  isFixed: boolean;
  /** 借贷方向：lend 借出 / borrow 借入（仅 loan 有意义，用于按钮文案「还款」/「收款」） */
  direction?: string | null;
  tags?: { id: string; name: string; color: string }[];
  /** 收款账户默认值（持仓的扣款账户） */
  paymentAccountId: string;
  /** 可选的收款账户列表 */
  accounts?: { id: string; name: string; icon: string }[];
  /** 持仓币种（原币）：弹窗金额按此币种符号展示 */
  currencyCode?: string;
}) {
  const t = useTranslations();
  const principalCents = actualCostCents(costCents, feeCents);
  // 到期类（定期 / 国债 / 借贷 / 储蓄型保险）：金额拆成「本金 + 应计利息」，弹窗分两栏录入
  // （未到期算到今天，到期日已过按到期日算；四类共用同一套界面与口径）
  const isAccrual =
    type === INV.deposit || type === INV.bond || type === INV.loan || type === INV.insurance;
  const accruedCents = isAccrual
    ? estimateAccruedCents({ principalCents, interestRate, startDate: purchaseDate, maturityDate })
    : 0;
  // 到期类默认到账金额 = 本金 + 应计利息；其余（卖出）为当前市值
  const defaultCents = isAccrual ? accruedCents : currentValueCents;
  // 借入用「还款」、借出/其它到期类用「到期」、可卖用「卖出」/ borrow → Repay, lend/other fixed → Mature, tradable → Sell
  const label = isFixed
    ? type === INV.loan
      ? direction === "borrow" ? t("investment.repay") : t("investment.collect")
      : t("investment.mature")
    : t("investment.sell");
  // 有数量的持仓（卖出）按数量录入：数量上限取展示口径，单位均价由当前市值摊出
  const maxQtyDisplay = quantity > 0 ? quantityToDisplay(type, quantity) : 0;
  const sellQty = !isFixed && maxQtyDisplay > 0
    ? { max: maxQtyDisplay, unitPriceCents: Math.round(currentValueCents / maxQtyDisplay) }
    : undefined;

  return (
    <InvestmentActionDialog
      action={(input) =>
        sellInvestment({
          id,
          amountYuan: input.amountYuan,
          feeYuan: input.feeYuan,
          // 展示口径 → 存储口径（缺省 = 整仓卖出）
          quantity: sellQty ? displayToQuantity(type, Number(input.qtyDisplay || 0)) : undefined,
          txDate: input.txDate,
          tagIds: input.tagIds,
          accountId: input.accountId,
          // 借入还款：本金 / 利息分栏透传（splitAmount 模式由弹窗提交）
          principalYuan: input.principalYuan,
          interestYuan: input.interestYuan,
        })
      }
      // 借入还款用「还款」标题/描述；其它到期类用「到期」；可卖用「卖出」
      title={type === INV.loan
        ? direction === "borrow" ? t("investment.repayTitle", { name }) : t("investment.collectTitle", { name })
        : (isFixed ? t("investment.matureTitle") : t("investment.sellTitle"))}
      desc={type === INV.loan
        ? direction === "borrow" ? t("investment.repayDesc", { name }) : t("investment.collectDesc", { name })
        : (isFixed ? t("investment.matureDesc", { name }) : t("investment.sellDesc", { name }))}
      name={name}
      okText={label}
      defaultAmountYuan={toYuan(defaultCents)}
      label={label}
      // 卖出与到期均可选标签（标签会打到该动作生成的所有流水上）
      tags={tags}
      accounts={accounts}
      defaultAccountId={paymentAccountId}
      // 卖出：成交金额 − 卖出费用 = 到账净额；有数量口径的持仓还可按数量部分卖出
      sellMode={!isFixed}
      sellQty={sellQty}
      // 到期类：本金 / 利息分栏录入（利息为负时按 0 显示，避免起息日前出现负数）
      splitAmount={isAccrual ? { principalCents, interestCents: Math.max(0, accruedCents - principalCents) } : undefined}
      currencyCode={currencyCode}
    />
  );
}

/** 派息 / 分红按钮：收款账户记一笔收入（投资收益），可多次派息 */
export function InvestmentDividendButton({
  id, type, name, quantity, tags, paymentAccountId, accounts, currencyCode,
}: {
  id: string;
  type: InvestmentType;
  name: string;
  /** 持仓数量（原始存储口径；0 = 无数量口径） */
  quantity: number;
  tags?: { id: string; name: string; color: string }[];
  /** 收款账户默认值（持仓的扣款账户） */
  paymentAccountId: string;
  /** 可选的收款账户列表 */
  accounts?: { id: string; name: string; icon: string }[];
  /** 持仓币种（原币）：弹窗金额按此币种符号展示 */
  currencyCode?: string;
}) {
  const t = useTranslations();
  // 仅有数量口径的持仓（股票/基金/数字资产/收藏品/贵金属）按「每股派息 × 派息股数」录入；
  // 固收 / 储蓄型保险的数量无业务含义（历史数据里可能存成 1）→ 直接填派息金额
  const maxQtyDisplay = !isFixedIncome(type) && quantity > 0 ? quantityToDisplay(type, quantity) : 0;
  return (
    <InvestmentActionDialog
      action={(input) =>
        dividendInvestment({
          id,
          amountYuan: input.amountYuan,
          txDate: input.txDate,
          tagIds: input.tagIds,
          accountId: input.accountId,
        })
      }
      title={t("investment.dividendTitle")}
      desc={t("investment.dividendDesc", { name })}
      name={name}
      okText={t("investment.dividend")}
      defaultAmountYuan=""
      label={t("investment.dividend")}
      tags={tags}
      accounts={accounts}
      defaultAccountId={paymentAccountId}
      dividendQty={maxQtyDisplay > 0 ? { max: maxQtyDisplay } : undefined}
      // 派息模式：金额标签固定为「派息金额」（无数量口径的持仓也要显示正确标签）
      dividendMode
      currencyCode={currencyCode}
    />
  );
}

/** 黄金 / 白银页签（URL ?sub= 驱动） */
export function MetalSubTabs({ counts }: { counts: Record<string, number> }) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sub") ?? "gold";

  function go(sub: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sub", sub);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {METAL_SUB_TYPES.map((s) => (
        <button
          key={s.v}
          type="button"
          onClick={() => go(s.v)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            current === s.v ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {s.icon} {t(s.key)}（{counts[s.v] ?? 0}）
        </button>
      ))}
    </div>
  );
}
