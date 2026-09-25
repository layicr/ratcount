"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useMoney, useBaseCurrency } from "@/components/currency-context";
import { formatCurrency } from "@/lib/money";
import { type InvestmentType, INV, INVESTMENT_STATUS } from "@/lib/constants";
import { investmentIcon, quantityToDisplay, areaToDisplay, isStockLike } from "@/lib/investment-types";
import { estimateAccruedCents, holdingProfitCents } from "@/lib/investment-flow";
import { InvestmentDeleteButton, InvestmentSellButton, InvestmentDividendButton, InvestmentCopyButton } from "./investment-list-client";
import { Pagination } from "./pagination";
import type { HoldingItem } from "./investment-form";

/** 表格变体：可交易（股票/基金/数字资产）/ 贵金属 / 固收（定期/国债/借贷/保险）/ 不动产 */
export type HoldingTableVariant = "tradable" | "metal" | "fixed" | "estate";

/** 收益率：收益 / 实际成本（成本+费用） */
function rate(profit: number, cost: number, fee: number): string {
  const base = cost + fee;
  if (!base) return "—";
  return `${((profit / base) * 100).toFixed(1)}%`;
}

/** 持仓行收益（分）：借入方向取负（负债），其余沿用 holdingProfitCents（非负计入） */
function rowProfit(h: HoldingItem, value: number): number {
  if (h.type === INV.loan && h.direction === "borrow") {
    return -((value - h.costCents - h.feeCents));
  }
  return holdingProfitCents({
    valueCents: value,
    costCents: h.costCents,
    feeCents: h.feeCents,
    dividendCents: h.dividendCents,
  });
}

const th = "py-2 text-xs font-normal text-slate-400";
const thRight = `${th} text-right`;

/**
 * 投资管理页通用区块：标题 + 汇总 + 搜索框 + 新增按钮 + 表格 + 分页
 * 10 个管理页共用（9 个类型页 + 贵金属页），列定义按 variant 分支，避免重复表格
 */
export function InvestmentTypeTable({
  variant,
  type,
  title,
  holdings,
  newHref,
  total,
  page,
  pageSize,
  q,
  extraQuery,
  dateFrom,
  dateTo,
  pagination,
  tags,
  accounts,
}: {
  variant: HoldingTableVariant;
  type: InvestmentType;
  title: string;
  holdings: HoldingItem[];
  newHref: string;
  /** 当前账本全部标签（卖出/到期/派息动作可选，打到生成的流水上） */
  tags?: { id: string; name: string; color: string }[];
  /** 收款账户候选（到期/派息弹窗可选，默认持仓的扣款账户） */
  accounts?: { id: string; name: string; icon: string }[];
  total?: number;
  page?: number;
  pageSize?: number;
  q?: string;
  extraQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 分页数据：由页面用 lib/pagination 预生成后传入（结构与流水明细一致） */
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    pageSizeOptions?: number[];
    prevHref: string;
    nextHref: string;
    pageHrefs: { page: number; href: string }[];
  };
}) {
  const pathname = usePathname();
  const money = useMoney();
  const baseCur = useBaseCurrency();
  const locale = useLocale();
  // 持仓明细按原币币种符号展示；顶部「总市值/总收益」为基准币种聚合，仍用 money()
  const hx = (h: HoldingItem, c: number) => formatCurrency(c, h.currencyCode ?? baseCur, locale);
  // 文案走 useTranslations 按需取键：不再由页面下传整份字典（≈33KB/语言，且与 NextIntlClientProvider 重复）
  const t = useTranslations();
  const ti = useTranslations("investment");
  // 定期 / 国债：无「市值」概念，按「本金 × (1 + 年利率 × 天数 ÷ 365)」估算本息
  // （未到期算到今天，到期日已过按到期日算；已到期已结算的用实际到账值，不重算）
  const isAccrual = type === INV.deposit || type === INV.bond;
  const valueOf = (h: HoldingItem) =>
    isAccrual && h.status === INVESTMENT_STATUS.active
      ? estimateAccruedCents({
          principalCents: h.costCents + h.feeCents,
          interestRate: h.interestRate,
          startDate: h.purchaseDate,
          maturityDate: h.maturityDate,
        })
      : h.currentValueCents;
  // 跨币种汇总：各持仓存「基准币种快照」base*，直接求和即基准币种总额（不再把各原币分相加后套基准符号，避免汇率失真）
  // Cross-currency summary: each holding stores a base-currency snapshot (base*); summing yields the correct base total
  const baseValueOf = (h: HoldingItem) =>
    isAccrual && h.status === INVESTMENT_STATUS.active
      ? estimateAccruedCents({
          principalCents: (h.baseCostCents ?? h.costCents) + (h.baseFeeCents ?? h.feeCents),
          interestRate: h.interestRate,
          startDate: h.purchaseDate,
          maturityDate: h.maturityDate,
        })
      : (h.baseValueCents ?? h.currentValueCents);
  const totalValue = holdings.reduce((s, h) => s + baseValueOf(h), 0);
  // 总收益（基准币种）：估值 − 成本 − 费用 + 累计派息；借入方向取负（与行内 rowProfit 口径一致）
  const totalProfit = holdings.reduce((s, h) => {
    const v = baseValueOf(h);
    const cost = (h.baseCostCents ?? h.costCents) + (h.baseFeeCents ?? h.feeCents);
    const div = h.baseDividendCents ?? h.dividendCents;
    if (h.type === INV.loan && h.direction === "borrow") return s - (v - cost);
    return s + v - cost + div;
  }, 0);
  // 实际成本合计（基准币种）：成本 + 费用 / total actual cost in base: cost + fee
  const totalCost = holdings.reduce((s, h) => s + (h.baseCostCents ?? h.costCents) + (h.baseFeeCents ?? h.feeCents), 0);
  const curPage = pagination?.page ?? page ?? 1;
  const curPageSize = pagination?.pageSize ?? pageSize ?? 10;
  const totalPages = pagination?.totalPages ?? (total ? Math.max(1, Math.ceil(total / curPageSize)) : 1);
  const displayTotal = total ?? holdings.length;
  // 类股票（股票 / 数字资产）列表列标题使用带口径说明的文案，其余类型沿用简短文案
  const isStockLike = type === INV.stock || type === INV.digital_asset;
  // 估值列标题：定期 / 国债用「本息预估」，不动产用「当前估价」，类股票用「当前市值」，其余沿用「市值」
  const marketValueLabel = isAccrual
    ? ti("accruedValue")
    : variant === "estate" ? ti("currentAppraisal") : isStockLike ? ti("valueAmount") : ti("marketValue");
  const costLabel = variant === "estate" ? ti("purchasePrice") : isStockLike ? <>{ti("actualCost")}<br />{ti("actualCostDetail")}</> : ti("actualCost");
  // 收益列标题：定期 / 国债为「应计利息」（本息预估 − 本金），其余沿用原有口径
  const profitLabel = isAccrual ? ti("accruedInterest") : variant === "estate" ? ti("appreciation") : isStockLike ? <>{ti("floatingProfit")}<br />{ti("floatingProfitDetail")}</> : ti("profit");
  const rateLabel = variant === "estate" ? ti("appreciationRate") : isStockLike ? <>{ti("profitRate")}<br />{ti("profitRateDetail")}</> : ti("profitRate");
  // 派息按钮：股票 / 基金 / 储蓄型保险；
  // 定期 / 国债（到期一次性还本付息，收益按「本息预估」口径）、数字资产、收藏品、借贷、贵金属、不动产
  // 均无派息概念，不显示（避免同一段利息在「应计利息 + 累计派息」里被计两次）
  const showDividend = type === INV.stock || type === INV.fund || type === INV.insurance;

  return (
    <div className="space-y-4">
      {/* 标题 + 新增按钮 */}
      {/* 标题 + 汇总 */}
      <div>
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        <div className="mt-1 text-xs text-slate-400">
          {/* 汇总口径（基准币种，已按汇率折算）：持有数量 · 实际成本 · 市值/本息预估 · 收益/应计利息 */}
          {ti("holdings")} {displayTotal}
          <> · {ti("actualCost")} {money(totalCost)}</> ·{" "}
          {isAccrual ? ti("accruedValue") : ti("marketValue")} {money(totalValue)} ·{" "}
          {isAccrual ? ti("accruedInterest") : ti("profit")}{" "}
          <span className={totalProfit >= 0 ? "text-green-600" : "text-red-600"}>
            {totalProfit < 0 ? "-" : ""}{money(Math.abs(totalProfit))}
          </span>
        </div>
      </div>

      {/* 新增按钮 + 搜索框 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={newHref}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 hover:text-white"
        >
          {ti("add")}
        </Link>
        <form action={pathname} method="get" className="flex items-center gap-2">
        {extraQuery && (
          <input type="hidden" name={extraQuery.split("=")[0]} value={extraQuery.split("=")[1] ?? ""} />
        )}
        <input
          type="date"
          name="from"
          aria-label={variant === "fixed" ? ti("startDate") : ti("purchaseDate")}
          defaultValue={dateFrom ?? ""}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-teal-500"
        />
        <span className="text-xs text-slate-400">~</span>
        <input
          type="date"
          name="to"
          aria-label={variant === "fixed" ? ti("startDate") : ti("purchaseDate")}
          defaultValue={dateTo ?? ""}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-teal-500"
        />
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          {t("common.filter")}
        </button>
        <Link
          href={`${pathname}${extraQuery ? `?${extraQuery}` : ""}`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {ti("clear")}
        </Link>
      </form>
      </div>

      {/* 表格 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {holdings.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className={th}>{ti("name")}</th>
                  {variant === "tradable" && <th className={th}>{ti("code")}</th>}
                  {variant === "metal" && <th className={th}>{ti("subType")}</th>}
                  {variant === "fixed" && (
                    <>
                      <th className={th}>{ti("interestRate")}</th>
                      <th className={th}>{ti("startDate")}</th>
                      <th className={th}>{ti("maturityDate")}</th>
                    </>
                  )}
                  {/* 借贷：持有数量（借款笔数无数量口径，固定显示「—」，置于实际成本之前）/ Loan: holding quantity (no quantity unit; fixed "—"), placed before actual cost */}
                  {type === INV.loan && <th className={thRight}>{ti("holdingQuantity")}</th>}
                  {variant === "estate" && (
                    <>
                      <th className={th}>{ti("location")}</th>
                      <th className={thRight}>{ti("area")}</th>
                    </>
                  )}
                  {(variant === "tradable" || variant === "metal") && <th className={thRight}>{variant === "metal" ? ti("grams") : ti("quantity")}</th>}
                  <th className={thRight}>{costLabel}</th>
                  <th className={thRight}>{marketValueLabel}</th>
                  <th className={thRight}>{profitLabel}</th>
                  <th className={thRight}>{rateLabel}</th>
                  {variant !== "fixed" && <th className={thRight}>{ti("purchaseDate")}</th>}
                  {/* 项目列 / 标签列左内边距：与上一列（右对齐的收益率）拉开间距 */}
                  <th className={`${th} pl-4`}>{t("common.project")}</th>
                  <th className={`${th} pl-4`}>{t("investment.tag")}</th>
                  <th className={thRight}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  // 估值：定期 / 国债为本息预估（应计本息），其余为当前市值
                  const value = valueOf(h);
                  // 收益 = 估值 − 成本 − 费用 + 累计派息（派息时市值已除权，故两者不重复）；借入方向取负（负债）
                  const profit = rowProfit(h, value);
                  const isBorrow = h.type === INV.loan && h.direction === "borrow";
                  return (
                    <tr key={h.id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">
                        <span className="mr-1">{investmentIcon(h.type)}</span>
                        {h.name}
                        {/* 借贷方向徽章：借出（资产）/ 借入（负债） */}
                        {h.type === INV.loan && h.direction && (
                          <span
                            className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${h.direction === "borrow" ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-600"}`}
                          >
                            {ti(h.direction === "borrow" ? "borrow" : "lend")}
                          </span>
                        )}
                      </td>
                      {variant === "tradable" && <td className="text-slate-500">{h.code ?? "—"}</td>}
                      {variant === "metal" && (
                        <td className="text-slate-500">
                          {h.subType ? t(`investment.${h.subType}`) : "—"}
                        </td>
                      )}
                      {variant === "fixed" && (
                        <>
                          <td className="text-slate-500">{h.interestRate ?? "—"}</td>
                          <td className="text-slate-500">{h.purchaseDate ?? "—"}</td>
                          <td className="text-slate-500">{h.maturityDate ?? "—"}</td>
                        </>
                      )}
                      {/* 借贷：持有数量（无数量口径显示「—」）/ Loan: holding quantity ("—" when no quantity) */}
                      {type === INV.loan && (
                        <td className="text-right text-slate-500">{h.quantity > 0 ? quantityToDisplay(h.type, h.quantity) : "—"}</td>
                      )}
                      {variant === "estate" && (
                        <>
                          <td className="max-w-[180px] truncate text-slate-500">{h.location ?? "—"}</td>
                          <td className="text-right text-slate-500">{h.areaSqm ? `${areaToDisplay(h.areaSqm)} ㎡` : "—"}</td>
                        </>
                      )}
                      {(variant === "tradable" || variant === "metal") && (
                        <td className="text-right text-slate-500">{quantityToDisplay(h.type, h.quantity)}</td>
                      )}

                      <td className={`text-right ${isBorrow ? "text-rose-600" : "text-slate-700"}`}>{isBorrow ? "−" : ""}{hx(h, h.costCents + h.feeCents)}{isStockLike && <><br /><span className="text-xs text-slate-400">（{hx(h, h.costCents)} + {hx(h, h.feeCents)}）</span></>}</td>
                      <td className={`text-right ${isBorrow ? "text-rose-600" : "text-slate-700"}`}>{isBorrow ? "−" : ""}{hx(h, value)}</td>
                      <td className={`text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {profit < 0 ? "-" : ""}{hx(h, Math.abs(profit))}
                        {h.dividendCents > 0 ? (
                          // 有分红：拆解「浮盈 + 累计派息」，避免与除权后的市值口径混淆
                          <><br /><span className="text-xs text-slate-400">（{ti("profit")} {hx(h, profit - h.dividendCents)} + {ti("dividendAccumulated")} {hx(h, h.dividendCents)}）</span></>
                        ) : (
                          isStockLike && <><br /><span className="text-xs text-slate-400">（{hx(h, h.currentValueCents)} - {hx(h, h.costCents + h.feeCents)}）</span></>
                        )}
                      </td>
                      <td className={`text-right ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {rate(profit, h.costCents, h.feeCents)}
                      </td>
                      {variant !== "fixed" && <td className="text-slate-400 text-right">{h.purchaseDate ?? "—"}</td>}
                      {/* 归属项目（表单可选）；左内边距与表头保持一致 */}
                      <td className="max-w-[10rem] truncate py-2 pl-4 text-slate-500">
                        {h.project ? `${h.project.icon} ${h.project.name}` : "—"}
                      </td>
                      {/* 持仓标签（编辑页可改）；左内边距与表头保持一致 */}
                      <td className="py-2 pl-4">
                        <div className="flex flex-wrap gap-1">
                          {h.tags && h.tags.length > 0 ? (
                            h.tags.map((tg) => (
                              <span
                                key={tg.id}
                                className="rounded-full px-2 py-0.5 text-[10px] text-white"
                                style={{ background: tg.color }}
                              >
                                {tg.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {/* 仅活跃持仓可修改：已卖出 / 已到期为已结算记录，只读 */}
                          {h.status === INVESTMENT_STATUS.active && (
                            <Link href={`/investments/${h.id}/edit?type=${h.type}`} className="text-xs text-slate-500 hover:text-teal-600">
                              {t("common.edit")}
                            </Link>
                          )}
                          {/* 仅活跃持仓可卖出 / 到期 / 派息 */}
                          {h.status === INVESTMENT_STATUS.active && (
                            <>
                              <InvestmentSellButton
                                id={h.id}
                                type={type}
                                name={h.name}
                                costCents={h.costCents}
                                feeCents={h.feeCents}
                                quantity={h.quantity}
                                currentValueCents={h.currentValueCents}
                                interestRate={h.interestRate}
                                purchaseDate={h.purchaseDate}
                                maturityDate={h.maturityDate}
                                isFixed={variant === "fixed"}
                                tags={tags}
                                paymentAccountId={h.paymentAccountId}
                                accounts={accounts}
                                currencyCode={h.currencyCode}
                              />
                              {showDividend && (
                                <InvestmentDividendButton
                                  id={h.id}
                                  type={type}
                                  name={h.name}
                                  quantity={h.quantity}
                                  tags={tags}
                                  paymentAccountId={h.paymentAccountId}
                                  accounts={accounts}
                                  currencyCode={h.currencyCode}
                                />
                              )}
                              {/* 仅活跃持仓可复制：生成同源新持仓（含买入流水、标签、审计） */}
                              <InvestmentCopyButton id={h.id} type={h.type} name={h.name} />
                            </>
                          )}
                          <InvestmentDeleteButton id={h.id} type={h.type} name={h.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页控件（全局共用，链接由页面服务端预生成） */}
        {pagination && <Pagination link={pagination} />}
      </div>
    </div>
  );
}
