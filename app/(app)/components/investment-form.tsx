"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { createInvestment, updateInvestment } from "@/app/actions/investments";
import { type InvestmentType, INV, type MetalSubType, DEFAULT_CURRENCY } from "@/lib/constants";
import { METAL_SUB_TYPES, displayToQuantity, quantityToDisplay, areaToDisplay, displayToArea, isStockLike, isFixedIncome, linkedAccountTypeOf } from "@/lib/investment-types";
import { TagPicker } from "./tag-picker";
import { ConfirmButton, useToast } from "./confirm";

/** 账户下拉选项 */
export type AccountOpt = { id: string; name: string; icon: string; balanceCents: number; accountType: string };
/** 项目下拉选项 */
export type ProjectOpt = { id: string; name: string; icon: string };

/** 持仓行（服务端传入，可序列化） */
export type HoldingItem = {
  id: string;
  type: string;
  subType: string | null;
  name: string;
  code: string | null;
  accountId: string;
  paymentAccountId: string;
  quantity: number;
  costCents: number;
  feeCents: number;
  currentValueCents: number;
  purchaseDate: string | null;
  maturityDate: string | null;
  interestRate: string | null;
  location: string | null;
  areaSqm: number | null;
  projectId: string | null;
  status: string; // active / sold / matured / deleted
  remark: string | null;
  /** 累计派息（分）：派息时累加，市值同步除权 */
  dividendCents: number;
  /** 持仓标签 ID（编辑回显用，由页面查询后附上） */
  tagIds?: string[];
  /** 持仓标签完整信息（列表展示用，由页面查询后附上） */
  tags?: { id: string; name: string; color: string }[];
  /** 归属项目完整信息（列表展示用，由页面查询后附上） */
  project?: { id: string; name: string; icon: string };
};

/** 分 → 元（表单回填用，保留两位） */
const toYuan = (cents: number) => (cents / 100).toFixed(2);

function initialForm(initial: HoldingItem | null, defaultSubType?: string) {
  return {
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    accountId: initial?.accountId ?? "",
    paymentAccountId: initial?.paymentAccountId ?? "",
    qty: initial && initial.type !== INV.real_estate ? String(quantityToDisplay(initial.type, initial.quantity)) : "",
    area: initial?.areaSqm ? String(areaToDisplay(initial.areaSqm)) : "",
    costYuan: initial ? toYuan(initial.costCents) : "",
    feeYuan: initial ? toYuan(initial.feeCents) : "",
    valueYuan: initial ? toYuan(initial.currentValueCents) : "",
    purchaseDate: initial?.purchaseDate ?? "",
    maturityDate: initial?.maturityDate ?? "",
    interestRate: initial?.interestRate ?? "",
    location: initial?.location ?? "",
    subType: initial?.subType ?? defaultSubType ?? "gold",
    remark: initial?.remark ?? "",
    projectId: initial?.projectId ?? "",
  };
}

const inputCls = "w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-teal-500";
const labelCls = "mb-1 block text-xs text-slate-500";

/**
 * 投资持仓表单（独立页面用）
 * 按 type 动态渲染字段；金额以「元」输入并由服务端转分。
 * 保存成功后跳回 backHref（列表页）。
 */
export function InvestmentForm({
  type,
  initial,
  accounts,
  backHref,
  defaultSubType,
  tags,
  projects,
}: {
  type: InvestmentType;
  initial?: HoldingItem | null;
  accounts: AccountOpt[];
  backHref: string;
  defaultSubType?: string;
  /** 当前账本全部标签（新建/编辑持仓均可选；新建时同一组标签同时打到买入/存入流水上） */
  tags?: { id: string; name: string; color: string }[];
  /** 当前账本全部项目（可选） */
  projects?: ProjectOpt[];
}) {
  const t = useTranslations();
  const f = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(() => initialForm(initial ?? null, defaultSubType));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const set = (k: keyof ReturnType<typeof initialForm>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isMetal = type === INV.metal;
  const isEstate = type === INV.real_estate;
  const isInsurance = type === INV.insurance;
  // 定期存款无「当前市值」概念：不显示该字段，保存时市值取本金
  const isDeposit = type === INV.deposit;
  // 类股票（股票 / 数字资产）：代码 + 数量为必填（标签带红色 *），并显示详细成本/收益文案
  const showCode = isStockLike(type) || type === INV.fund || type === INV.collectible;
  // 关联账户按持仓类型限定账户类型（基金 → 基金账户；无匹配则不筛选）；
  // 已选账户若不属于该类型（历史数据）仍保留在选项里，避免编辑页回显为空
  const linkedType = linkedAccountTypeOf(type);
  const accountOptions = (() => {
    const matched = linkedType ? accounts.filter((a) => a.accountType === linkedType) : accounts;
    const cur = form.accountId ? accounts.find((a) => a.id === form.accountId) : undefined;
    return cur && !matched.some((a) => a.id === cur.id) ? [...matched, cur] : matched;
  })();

  /** 保存前校验（替代原生 required，支持 i18n）：返回 false 时只显示错误、不弹确认框 */
  function validateBeforeSave(): boolean {
    setErr(null);
    if (!form.name.trim()) { setErr("common.nameRequired"); return false; }
    // 股票类型必填校验：代码/数量/成本金额/当前市值/交易费用/买入日期
    if (isStockLike(type)) {
      if (!form.code.trim()) { setErr("investment.codeRequired"); return false; }
      if (!form.qty || Number(form.qty) <= 0) { setErr("investment.quantityRequired"); return false; }
      if (!form.costYuan || Number(form.costYuan) <= 0) { setErr("investment.costAmountRequired"); return false; }
      if (!form.valueYuan || Number(form.valueYuan) <= 0) { setErr("investment.valueAmountRequired"); return false; }
      if (form.feeYuan === "") { setErr("investment.feeRequired"); return false; }
      if (!form.purchaseDate) { setErr("investment.purchaseDateRequired"); return false; }
    }
    // 储蓄型保险：本金/当前市值/利率/起息日/到期日必填
    if (isInsurance) {
      if (!form.costYuan.trim()) { setErr("investment.principalRequired"); return false; }
      const principalNum = Number(form.costYuan);
      if (!Number.isFinite(principalNum) || principalNum <= 0) { setErr("investment.principalInvalid"); return false; }
      if (!form.valueYuan.trim()) { setErr("investment.valueAmountRequired"); return false; }
      const valueNum = Number(form.valueYuan);
      if (!Number.isFinite(valueNum) || valueNum <= 0) { setErr("investment.valueAmountInvalid"); return false; }
      if (!form.interestRate.trim()) { setErr("investment.interestRateRequired"); return false; }
      const rateNum = parseFloat(form.interestRate);
      if (!Number.isFinite(rateNum)) { setErr("investment.interestRateInvalid"); return false; }
      if (!form.purchaseDate) { setErr("investment.purchaseDateRequired"); return false; }
      if (!form.maturityDate) { setErr("investment.maturityDateRequired"); return false; }
    }
    // 关联账户 / 扣款账户：全部投资类型必填（放在业务字段之后）
    if (!form.accountId) { setErr("investment.accountRequired"); return false; }
    if (!form.paymentAccountId) { setErr("investment.paymentAccountRequired"); return false; }
    return true;
  }

  async function submit() {
    // 双保险：确认框已先校验，此处再校验一次（防绕过调用）
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const input = {
        type,
        subType: isMetal ? (form.subType as MetalSubType) : null,
        name: form.name.trim(),
        code: form.code || null,
        accountId: form.accountId,
        paymentAccountId: form.paymentAccountId,
        quantity: isEstate || isFixedIncome(type) ? 0 : displayToQuantity(type, Number(form.qty || 0)),
        costYuan: form.costYuan || "0",
        feeYuan: form.feeYuan || "0",
        // 定期不显示市值输入框：新建时市值 = 本金；编辑时保留库中原值（可能已派息除权）
        valueYuan: isDeposit ? form.valueYuan || form.costYuan || "0" : form.valueYuan || "0",
        purchaseDate: form.purchaseDate || null,
        maturityDate: form.maturityDate || null,
        interestRate: form.interestRate || null,
        location: form.location || null,
        areaSqm: isEstate && form.area ? displayToArea(Number(form.area)) : null,
        remark: form.remark || null,
        tagIds, // 持仓标签：新建/编辑均保存（新建时同一组标签打到买入流水上）
        projectId: form.projectId || null,
      };
      const r = initial
        ? await updateInvestment(initial.id, input)
        : await createInvestment(input);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      toast(t("common.saved")); // 保存成功轻提示（跳转回列表页后仍可见）
      router.push(backHref);
      router.refresh();
    } catch {
      setErr("errors.saveFailed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("investment.name")} <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </div>

        {isMetal && (
          <div>
            <label className={labelCls}>{t("investment.subType")}</label>
            <select value={form.subType} onChange={(e) => set("subType", e.target.value)} className={inputCls}>
              {METAL_SUB_TYPES.map((s) => (
                <option key={s.v} value={s.v}>{s.icon} {t(s.key)}</option>
              ))}
            </select>
          </div>
        )}

        {showCode && (
          <div>
            <label className={labelCls}>{t("investment.code")}{isStockLike(type) && <span className="text-red-500">*</span>}</label>
            <input value={form.code} onChange={(e) => set("code", e.target.value)} className={inputCls} />
          </div>
        )}

        {!isEstate && !isFixedIncome(type) && (
          <div>
            <label className={labelCls}>{type === INV.collectible ? t("investment.pieces") : type === INV.fund ? t("investment.shares") : type === INV.metal ? t("investment.grams") : t("investment.quantity")}{isStockLike(type) && <span className="text-red-500">*</span>}</label>
            <input value={form.qty} onChange={(e) => set("qty", e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
        )}

        <div>
          <label className={labelCls}>{isFixedIncome(type) ? t("investment.principal") : t("investment.costAmount")} <span className="text-red-500">*</span></label>
          <input value={form.costYuan} onChange={(e) => set("costYuan", e.target.value)} inputMode="decimal" className={inputCls} />
        </div>

        {/* 定期存款：不显示「当前市值」（市值 = 本金），保存时自动取本金 */}
        {!isDeposit && (
          <div>
            <label className={labelCls}>{isEstate ? t("investment.currentAppraisal") : t("investment.valueAmount")} <span className="text-red-500">*</span></label>
            <input value={form.valueYuan} onChange={(e) => set("valueYuan", e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
        )}

        {/* 累计派息（只读展示，派息时已从市值中除权） */}
        {initial && initial.dividendCents > 0 && (
          <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {t("investment.dividendAccumulated")}：
            <span className="font-medium text-slate-700">
              {f.number(initial.dividendCents / 100, { style: "currency", currency: DEFAULT_CURRENCY })}
            </span>
            <span className="ml-2 text-slate-400">{t("investment.dividendExcludedHint")}</span>
          </div>
        )}

        {!isFixedIncome(type) && !isEstate && (
          <div>
            <label className={labelCls}>{t("investment.fee")} <span className="text-red-500">*</span></label>
            <input value={form.feeYuan} onChange={(e) => set("feeYuan", e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
        )}

        {isFixedIncome(type) && (
          <div>
            <label className={labelCls}>{t("investment.interestRate")}{isInsurance && <span className="text-red-500">*</span>}</label>
            <input value={form.interestRate} onChange={(e) => set("interestRate", e.target.value)} placeholder="2.60%" className={inputCls} />
          </div>
        )}

        <div>
          <label className={labelCls}>{isFixedIncome(type) ? t("investment.startDate") : t("investment.purchaseDate")} <span className="text-red-500">*</span></label>
          <input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className={inputCls} />
        </div>

        {isFixedIncome(type) && (
          <div>
            <label className={labelCls}>{t("investment.maturityDate")}{isInsurance && <span className="text-red-500">*</span>}</label>
            <input type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} className={inputCls} />
          </div>
        )}

        {isEstate && (
          <>
            <div>
              <label className={labelCls}>{t("investment.location")}</label>
              <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("investment.area")}（㎡）</label>
              <input value={form.area} onChange={(e) => set("area", e.target.value)} inputMode="decimal" className={inputCls} />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className={labelCls}>{t("investment.account")} <span className="text-red-500">*</span></label>
          <select value={form.accountId} onChange={(e) => set("accountId", e.target.value)} className={inputCls}>
            <option value="">{t("investment.plsSelect")}</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}（{f.number(a.balanceCents / 100, { style: "currency", currency: DEFAULT_CURRENCY })}）</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>{t("investment.paymentAccount")} <span className="text-red-500">*</span></label>
          <select value={form.paymentAccountId} onChange={(e) => set("paymentAccountId", e.target.value)} className={inputCls}>
            <option value="">{t("investment.plsSelect")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}（{f.number(a.balanceCents / 100, { style: "currency", currency: DEFAULT_CURRENCY })}）</option>
            ))}
          </select>
        </div>

        {projects && projects.length > 0 && (
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("investment.project")}</label>
            <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={inputCls}>
              <option value="">{t("investment.plsSelect")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className={labelCls}>{t("common.remark")}</label>
          <input value={form.remark} onChange={(e) => set("remark", e.target.value)} className={inputCls} />
        </div>

        {tags && tags.length > 0 && (
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("investment.tags")}</label>
            <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
          </div>
        )}

        {err && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {t(err, { defaultValue: err })}
          </p>
        )}

        <div className="flex gap-2 sm:col-span-2">
          {/* 保存前弹确认框（与流水/账户等表单一致），保存成功后轻提示 */}
          <ConfirmButton
            action={submit}
            beforeOpen={validateBeforeSave}
            title={t("investment.saveTitle")}
            desc={initial ? t("common.saveEditDesc", { id: form.name.trim() }) : t("common.createDesc")}
            okText={t("common.save")}
          >
            <span className="inline-block rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700">
              {saving ? t("common.processing") : t("common.save")}
            </span>
          </ConfirmButton>
          <button type="button" onClick={() => router.push(backHref)} className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}
