"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { todayStr } from "@/lib/investment-flow";
import { TagPicker } from "./tag-picker";
import { ConfirmButton } from "./confirm";
import { useBaseCurrency } from "@/components/currency-context";
import { formatCurrency } from "@/lib/money";

/**
 * 投资操作弹窗（卖出 / 到期 / 派息共用）
 *  - ConfirmButton 仅支持「标题 + 描述」确认框，无法录入金额与日期，故单独封装
 *  - 视觉沿用 ConfirmButton：bg-black/40 遮罩 + rounded-2xl 卡片
 *  - action 返回 { ok, error }，失败时在弹窗内展示服务端错误而不静默关闭
 *  - 支持选标签，标签会打到该动作生成的所有流水上
 *  - 卖出模式（sellMode）：成交金额 − 卖出费用 = 到账净额；传 sellQty 时还可按数量部分卖出
 *  - 点击遮罩不关闭：弹窗内有金额/日期/标签录入，避免误点导致内容丢失（仅「取消」关闭）
 */
export function InvestmentActionDialog({
  action,
  title,
  desc,
  name,
  okText,
  defaultAmountYuan,
  label,
  danger,
  disabled,
  tags,
  accounts,
  defaultAccountId,
  sellMode,
  sellQty,
  dividendQty,
  splitAmount,
  dividendMode,
  currencyCode,
}: {
  action: (input: {
    amountYuan: string;
    feeYuan: string;
    qtyDisplay: string;
    txDate: string;
    tagIds: string[];
    accountId?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  title: string;
  desc: string;
  /** 持仓名称（二次确认文案用） */
  name: string;
  okText?: string;
  defaultAmountYuan: string;
  label: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  tags?: { id: string; name: string; color: string }[];
  /** 可选的收款账户（不传则不显示收款账户选择） */
  accounts?: { id: string; name: string; icon: string }[];
  /** 收款账户默认值（一般为持仓的扣款账户） */
  defaultAccountId?: string;
  /** 卖出模式：显示「卖出费用」，金额口径为「成交金额」 */
  sellMode?: boolean;
  /** 按数量卖出（股票/基金/贵金属等有数量的持仓）；不传则按整仓处理 */
  sellQty?: { max: number; unitPriceCents: number };
  /** 派息按「每股派息 × 派息股数」录入（有数量口径的持仓）；不传则直接填金额 */
  dividendQty?: { max: number };
  /** 定期到期：金额拆成「本金 + 利息」两个输入框，合计 = 到账金额（替代单一金额输入） */
  splitAmount?: { principalCents: number; interestCents: number };
  /** 派息模式：金额标签用「派息金额」（无数量口径的持仓，如储蓄型保险，也走这条） */
  dividendMode?: boolean;
  /** 持仓币种（原币）：弹窗内金额均按此币种符号展示 */
  currencyCode?: string;
}) {
  const t = useTranslations();
  const baseCur = useBaseCurrency();
  const locale = useLocale();
  // 弹窗内金额均为原币（持仓币种）口径，按各自币种符号展示 / dialog amounts are native, shown with the holding's own symbol
  const nativeMoney = (cents: number) => formatCurrency(cents, currencyCode ?? baseCur, locale);
  const [open, setOpen] = useState(false);
  const [amountYuan, setAmountYuan] = useState(defaultAmountYuan);
  // 定期到期：本金 / 利息分开录入（未传 splitAmount 时不使用）
  const [principalYuan, setPrincipalYuan] = useState(() => (splitAmount ? (splitAmount.principalCents / 100).toFixed(2) : ""));
  const [interestYuan, setInterestYuan] = useState(() => (splitAmount ? (splitAmount.interestCents / 100).toFixed(2) : ""));
  const [feeYuan, setFeeYuan] = useState("0.00");
  const [qtyDisplay, setQtyDisplay] = useState(() => (sellQty ? String(sellQty.max) : ""));
  const [perShareYuan, setPerShareYuan] = useState("");
  const [divShares, setDivShares] = useState(() => (dividendQty ? String(dividendQty.max) : ""));
  const [txDate, setTxDate] = useState(() => todayStr());
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleOpen() {
    setAmountYuan(defaultAmountYuan);
    setPrincipalYuan(splitAmount ? (splitAmount.principalCents / 100).toFixed(2) : "");
    setInterestYuan(splitAmount ? (splitAmount.interestCents / 100).toFixed(2) : "");
    setFeeYuan("0.00");
    setQtyDisplay(sellQty ? String(sellQty.max) : "");
    setPerShareYuan("");
    setDivShares(dividendQty ? String(dividendQty.max) : "");
    setTxDate(todayStr());
    setAccountId(defaultAccountId ?? "");
    setTagIds([]);
    setErr(null);
    setOpen(true);
  }

  /** 数量变化：按单位均价自动带出成交金额（仍可手改） */
  function onQtyChange(v: string) {
    setQtyDisplay(v);
    if (!sellQty) return;
    const q = Number(v);
    if (Number.isFinite(q) && q > 0) setAmountYuan(((q * sellQty.unitPriceCents) / 100).toFixed(2));
  }

  /** 派息：每股派息 × 派息股数 → 自动带出派息金额（仍可手改） */
  function onDividendInput(perShare: string, shares: string) {
    const p = Number(perShare);
    const n = Number(shares);
    if (Number.isFinite(p) && Number.isFinite(n) && p > 0 && n > 0) {
      setAmountYuan((p * n).toFixed(2));
    }
  }

  /** 数值解析：空视为 0，非法返回 null */
  const num = (v: string): number | null => {
    const s = v.trim();
    if (s === "") return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  /** 定期到期合计（分）：本金 + 利息；非法输入返回 null */
  const splitTotalCents = (() => {
    if (!splitAmount) return null;
    const p = num(principalYuan);
    const i = num(interestYuan);
    if (p === null || i === null) return null;
    return Math.round((p + i) * 100);
  })();
  /** 校验与提交用的金额：定期到期取「本金 + 利息」合计，其余取单一金额输入 */
  const effectiveAmountYuan = splitAmount
    ? (splitTotalCents === null ? "" : (splitTotalCents / 100).toFixed(2))
    : amountYuan;

  /** 保存前校验（确认框 beforeOpen 用）：不通过只提示、不弹确认框 */
  function validate(): boolean {
    if (sellQty) {
      const q = Number(qtyDisplay.trim());
      // 浮点容差：允许等于持仓数量（如 12.3456 克）
      if (!Number.isFinite(q) || q <= 0 || q > sellQty.max + 1e-9) {
        setErr("investment.sellQtyInvalid");
        return false;
      }
    }
    if (dividendQty) {
      const perShare = Number(perShareYuan.trim());
      if (!Number.isFinite(perShare) || perShare <= 0) {
        setErr("errors.amountInvalid");
        return false;
      }
      const shares = Number(divShares.trim());
      // 浮点容差：允许等于持仓数量
      if (!Number.isFinite(shares) || shares <= 0 || shares > dividendQty.max + 1e-9) {
        setErr("investment.dividendSharesInvalid");
        return false;
      }
    }
    // 定期到期：本金 / 利息均不得为负（合计必须 > 0，由下面统一校验）
    if (splitAmount) {
      const p = num(principalYuan);
      const i = num(interestYuan);
      if (p === null || i === null || p < 0 || i < 0) {
        setErr("errors.amountInvalid");
        return false;
      }
    }
    const amount = num(effectiveAmountYuan);
    if (amount === null || amount <= 0) {
      setErr("errors.amountInvalid");
      return false;
    }
    const fee = num(feeYuan);
    if (fee === null || fee < 0 || fee > amount) {
      setErr("investment.feeInvalid");
      return false;
    }
    return true;
  }

  async function submit() {
    // 双保险：确认框已先校验，此处再校验一次（防绕过调用）
    if (!validate()) return;
    setPending(true);
    setErr(null);
    try {
      const r = await action({
        amountYuan: effectiveAmountYuan.trim(),
        feeYuan: feeYuan.trim() || "0",
        qtyDisplay: qtyDisplay.trim(),
        txDate: txDate || todayStr(),
        tagIds,
        accountId: accountId || undefined,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setOpen(false);
    } catch {
      setErr("errors.invalidInput");
    } finally {
      setPending(false);
    }
  }

  // 到账净额预览（成交金额 − 卖出费用）
  const netPreviewCents = (() => {
    const a = num(amountYuan);
    const f = num(feeYuan);
    if (a === null || f === null) return null;
    return Math.round((a - f) * 100);
  })();

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-teal-500";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="text-xs text-slate-500 hover:text-teal-600 disabled:opacity-40"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{desc}</p>

            <div className="mt-4 space-y-3">
              {sellQty && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {t("investment.sellQuantity")} <span className="text-red-500">*</span>
                    <span className="ml-1 text-slate-400">（≤ {sellQty.max}）</span>
                  </label>
                  <input
                    value={qtyDisplay}
                    onChange={(e) => onQtyChange(e.target.value)}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </div>
              )}
              {dividendQty && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      {t("investment.dividendPerShare")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={perShareYuan}
                      onChange={(e) => {
                        setPerShareYuan(e.target.value);
                        onDividendInput(e.target.value, divShares);
                      }}
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      {t("investment.dividendShares")} <span className="text-red-500">*</span>
                      <span className="ml-1 text-slate-400">（≤ {dividendQty.max}）</span>
                    </label>
                    <input
                      value={divShares}
                      onChange={(e) => {
                        setDivShares(e.target.value);
                        onDividendInput(perShareYuan, e.target.value);
                      }}
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                </>
              )}
              {splitAmount ? (
                <>
                  {/* 定期到期：本金 + 利息 分开录入，合计 = 到账金额（便于与存单利息核对） */}
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      {t("investment.principal")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={principalYuan}
                      onChange={(e) => setPrincipalYuan(e.target.value)}
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">{t("investment.interest")}</label>
                    <input
                      value={interestYuan}
                      onChange={(e) => setInterestYuan(e.target.value)}
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="text-slate-500">{t("common.total")}</span>
                    <span className="font-semibold text-slate-700">
                      {splitTotalCents !== null ? nativeMoney(splitTotalCents) : "—"}
                    </span>
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {dividendQty || dividendMode
                      ? t("investment.dividendAmount")
                      : sellMode
                        ? t("investment.tradeAmount")
                        : t("common.amount")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={amountYuan}
                    onChange={(e) => setAmountYuan(e.target.value)}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </div>
              )}
              {sellMode && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">{t("investment.sellFee")}</label>
                  <input
                    value={feeYuan}
                    onChange={(e) => setFeeYuan(e.target.value)}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </div>
              )}
              {sellMode && (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                  <span className="text-slate-500">{t("investment.netProceeds")}</span>
                  <span className="font-semibold text-slate-700">
                    {netPreviewCents !== null ? nativeMoney(netPreviewCents) : "—"}
                  </span>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-slate-500">{t("common.date")}</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              {accounts && accounts.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {t("investment.receiveAccount")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className={inputCls}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {tags && tags.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">{t("investment.tags")}</label>
                  <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
                </div>
              )}
              {err && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {t(err, { defaultValue: err })}
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              {/* 二次确认：卖出/到期/派息等写操作执行前必须确认 */}
              <ConfirmButton
                action={submit}
                beforeOpen={validate}
                title={title}
                desc={t("investment.confirmTradeDesc", {
                  action: okText || t("common.confirm"),
                  name,
                  // 卖出按「到账净额」确认，其余按填写金额
                  amount: netPreviewCents !== null ? (netPreviewCents / 100).toFixed(2) : effectiveAmountYuan.trim() || "0.00",
                  account: accounts?.find((a) => a.id === accountId)?.name ?? "-",
                })}
                okText={okText || t("common.confirm")}
                className="flex-1"
                danger={danger}
              >
                <span className={`block w-full rounded-lg py-2 text-center text-sm font-semibold text-white ${
                  danger ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"
                }`}>
                  {pending ? t("common.processing") : okText || t("common.confirm")}
                </span>
              </ConfirmButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
