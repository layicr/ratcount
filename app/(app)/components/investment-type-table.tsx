"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/currency-context";
import { type InvestmentType, INV, INVESTMENT_STATUS } from "@/lib/constants";
import { investmentIcon, quantityToDisplay, areaToDisplay, isStockLike } from "@/lib/investment-types";
import { estimateAccruedCents, holdingProfitCents } from "@/lib/investment-flow";
import { InvestmentDeleteButton, InvestmentSellButton, InvestmentDividendButton } from "./investment-list-client";
import { Pagination } from "./pagination";
import type { HoldingItem } from "./investment-form";

/** 表格变体：可交易（股票/基金）/ 贵金属 / 固收（定期/国债）/ 不动产 */
export type HoldingTableVariant = "tradable" | "metal" | "fixed" | "estate";

/** 收益率：收益 / 实际成本（成本+费用） */
function rate(profit: number, cost: number, fee: number): string {
  const base = cost + fee;
  if (!base) return "—";
  return `${((profit / base) * 100).toFixed(1)}%`;
}

const th = "py-2 text-xs font-normal text-slate-400";
const thRight = `${th} text-right`;

/**
 * 投资管理页通用区块：标题 + 汇总 + 搜索框 + 新增按钮 + 表格 + 分页
 * 6 个管理页共用，列定义按 variant 分支，避免 6 份重复表格
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
  const totalValue = holdings.reduce((s, h) => s + valueOf(h), 0);
  // 总收益口径：估值（定期/国债为本息预估，其余为市值）− 成本 − 费用 + 累计派息
  const totalProfit = holdings.reduce(
    (s, h) => s + holdingProfitCents({
      valueCents: valueOf(h),
      costCents: h.costCents,
      feeCents: h.feeCents,
      dividendCents: h.dividendCents,
    }),
    0,
  );
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
          {/* 汇总口径与列头一致：定期 / 国债显示「本息预估 / 应计利息」，其余沿用「市值 / 收益」 */}
          {ti("holdings")} {displayTotal} · {isAccrual ? ti("accruedValue") : ti("marketValue")} {money(totalValue)} ·{" "}
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
                  // 收益 = 估值 − 成本 − 费用 + 累计派息（派息时市值已除权，故两者不重复）；定期即应计利息
                  const profit = holdingProfitCents({
                    valueCents: value,
                    costCents: h.costCents,
                    feeCents: h.feeCents,
                    dividendCents: h.dividendCents,
                  });
                  return (
                    <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2 text-slate-700">
                        <span className="mr-1">{investmentIcon(h.type)}</span>
                        {h.name}
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
                      {variant === "estate" && (
                        <>
                          <td className="max-w-[180px] truncate text-slate-500">{h.location ?? "—"}</td>
                          <td className="text-right text-slate-500">{h.areaSqm ? `${areaToDisplay(h.areaSqm)} ㎡` : "—"}</td>
                        </>
                      )}
                      {(variant === "tradable" || variant === "metal") && (
                        <td className="text-right text-slate-500">{quantityToDisplay(h.type, h.quantity)}</td>
                      )}

                      <td className="text-right text-slate-700">{money(h.costCents + h.feeCents)}{isStockLike && <><br /><span className="text-xs text-slate-400">（{money(h.costCents)} + {money(h.feeCents)}）</span></>}</td>
                      <td className="text-right text-slate-700">{money(value)}</td>
                      <td className={`text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {profit < 0 ? "-" : ""}{money(Math.abs(profit))}
                        {h.dividendCents > 0 ? (
                          // 有分红：拆解「浮盈 + 累计派息」，避免与除权后的市值口径混淆
                          <><br /><span className="text-xs text-slate-400">（{ti("profit")} {money(profit - h.dividendCents)} + {ti("dividendAccumulated")} {money(h.dividendCents)}）</span></>
                        ) : (
                          isStockLike && <><br /><span className="text-xs text-slate-400">（{money(h.currentValueCents)} - {money(h.costCents + h.feeCents)}）</span></>
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
                                />
                              )}
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
