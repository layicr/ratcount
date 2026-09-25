"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { createInvestment, updateInvestment } from "@/app/actions/investments";
import { type InvestmentType, INV, ACCT, type MetalSubType, DEFAULT_CURRENCY } from "@/lib/constants";
import { METAL_SUB_TYPES, displayToQuantity, quantityToDisplay, areaToDisplay, displayToArea, linkedAccountTypeOf, investmentTypeConfig } from "@/lib/investment-types";
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
  /** 借贷方向：lend 借出 / borrow 借入（仅 loan 类型有意义）/ loan direction: lend out / borrow in (loan only) */
  direction?: string | null;
  /** 累计派息（分）：派息时累加，市值同步除权 */
  dividendCents: number;
  /** 持仓币种（原币存储，展示用各自币种符号）/ holding currency (native; display with its own symbol */
  currencyCode?: string;
  /** 基准币种折算快照（写入时按汇率折算，跨币种汇总用；缺失回退原币字段）/ base-currency snapshots (converted at write); used for cross-currency summary; fall back to native if absent */
  baseCostCents?: number;
  baseValueCents?: number;
  baseFeeCents?: number;
  baseDividendCents?: number;
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
    direction: initial?.direction ?? "",
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

  // 借贷方向切换：翻转后关联账户类型（loan / borrowed）随之变化，原选账户大概率不符，清空避免错配
  // Loan direction switch: the linked account type (loan / borrowed) changes, so clear a mismatched selection
  function setDirection(d: "lend" | "borrow") {
    setForm((f) => {
      const nextType = d === "borrow" ? ACCT.borrowed : ACCT.loan;
      const cur = f.accountId ? accounts.find((a) => a.id === f.accountId) : undefined;
      const keep = cur && cur.accountType === nextType ? f.accountId : "";
      return { ...f, direction: d, accountId: keep };
    });
  }

  // 投资类型 UI 配置（单一数据源）：集中管理类型判定 / 字段显隐 / 必填 / 数量标签，新增类型只改 investmentTypeConfig
  // Investment type UI config (single source): type flags / field visibility / required / qty label
  const cfg = investmentTypeConfig(type);
  // 关联账户按持仓类型限定账户类型（基金 → 基金账户；无匹配则不筛选）；
  // 借贷按方向切换关联账户类型：借出 → loan 资产账户，借入 → borrowed 负债账户
  const linkedType = cfg.isLoan
    ? (form.direction === "borrow" ? ACCT.borrowed : ACCT.loan)
    : linkedAccountTypeOf(type);
  const accountOptions = (() => {
    const matched = linkedType ? accounts.filter((a) => a.accountType === linkedType) : accounts;
    const cur = form.accountId ? accounts.find((a) => a.id === form.accountId) : undefined;
    return cur && !matched.some((a) => a.id === cur.id) ? [...matched, cur] : matched;
  })();

  /** 保存前校验（替代原生 required，支持 i18n）：声明式校验列表，按类型组装，返回首个失败的错误 key */
  function validateBeforeSave(): boolean {
    setErr(null);
    const num = (s: string) => Number(s);
    if (!form.name.trim()) { setErr("common.nameRequired"); return false; }
    const checks: { ok: boolean; err: string }[] = [];
    if (cfg.isStockLike) {
      checks.push({ ok: !!form.code.trim(), err: "investment.cfg.codeRequired" });
      checks.push({ ok: !!form.qty && num(form.qty) > 0, err: "investment.quantityRequired" });
      checks.push({ ok: !!form.costYuan && num(form.costYuan) > 0, err: "investment.costAmountRequired" });
      checks.push({ ok: !!form.valueYuan && num(form.valueYuan) > 0, err: "investment.valueAmountRequired" });
      checks.push({ ok: form.feeYuan !== "", err: "investment.feeRequired" });
      checks.push({ ok: !!form.purchaseDate, err: "investment.purchaseDateRequired" });
    }
    if (cfg.isMetal) checks.push({ ok: !!form.qty && num(form.qty) > 0, err: "investment.gramsRequired" });
    if (cfg.isCollectible) checks.push({ ok: !!form.qty && num(form.qty) > 0, err: "investment.piecesRequired" });
    if (cfg.isFund) {
      checks.push({ ok: !!form.code.trim(), err: "investment.cfg.codeRequired" });
      checks.push({ ok: !!form.qty && num(form.qty) > 0, err: "investment.sharesRequired" });
    }
    if (cfg.isInsurance) {
      const p = form.costYuan.trim(); const pn = num(p);
      checks.push({ ok: !!p, err: "investment.principalRequired" });
      checks.push({ ok: Number.isFinite(pn) && pn > 0, err: "investment.principalInvalid" });
      const vv = form.valueYuan.trim(); const vn = num(vv);
      checks.push({ ok: !!vv, err: "investment.valueAmountRequired" });
      checks.push({ ok: Number.isFinite(vn) && vn > 0, err: "investment.valueAmountInvalid" });
      const r = form.interestRate.trim(); const rn = parseFloat(r);
      checks.push({ ok: !!r, err: "investment.interestRateRequired" });
      checks.push({ ok: Number.isFinite(rn), err: "investment.interestRateInvalid" });
      checks.push({ ok: !!form.purchaseDate, err: "investment.purchaseDateRequired" });
      checks.push({ ok: !!form.maturityDate, err: "investment.maturityDateRequired" });
    }
    // 关联账户 / 扣款账户：全部投资类型必填（放在业务字段之后）
    checks.push({ ok: !!form.accountId, err: "investment.accountRequired" });
    checks.push({ ok: !!form.paymentAccountId, err: "investment.paymentAccountRequired" });
    // 借贷必须选择方向（借出 / 借入）
    if (cfg.isLoan) checks.push({ ok: !!form.direction, err: "investment.directionRequired" });
    // 扣款账户余额不足提示（与定期 / 服务端口径一致）：非借入、跨账户买入时校验
    if (!(cfg.isLoan && form.direction === "borrow") && form.paymentAccountId && form.paymentAccountId !== form.accountId) {
      const buyCents = Math.round(Number(form.costYuan || 0) * 100) + Math.round(Number(form.feeYuan || 0) * 100);
      if (buyCents > 0) {
        const payer = accounts.find((a) => a.id === form.paymentAccountId);
        if (payer) {
          // 编辑态下，若扣款账户未变，旧买入流水会被删除释放额度，计入可用余额（与服务端口径一致）
          const oldBuyCents =
            initial && initial.paymentAccountId === form.paymentAccountId
              ? (initial.costCents || 0) + (initial.feeCents || 0)
              : 0;
          if (payer.balanceCents + oldBuyCents < buyCents) {
            checks.push({ ok: false, err: "errors.insufficientBalance" });
          }
        }
      }
    }
    const failed = checks.find((c) => !c.ok);
    if (failed) { setErr(failed.err); return false; }
    return true;
  }

  async function submit() {
    // 双保险：确认框已先校验，此处再校验一次（防绕过调用）
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const input = {
        type,
        subType: cfg.isMetal ? (form.subType as MetalSubType) : null,
        name: form.name.trim(),
        code: form.code || null,
        accountId: form.accountId,
        paymentAccountId: form.paymentAccountId,
        quantity: cfg.isEstate || cfg.isFixedIncome ? 0 : displayToQuantity(type, Number(form.qty || 0)),
        costYuan: form.costYuan || "0",
        feeYuan: form.feeYuan || "0",
        // 定期不显示市值输入框：新建时市值 = 本金；编辑时保留库中原值（可能已派息除权）
        valueYuan: cfg.isDeposit ? form.valueYuan || form.costYuan || "0" : form.valueYuan || "0",
        purchaseDate: form.purchaseDate || null,
        maturityDate: form.maturityDate || null,
        interestRate: form.interestRate || null,
        location: form.location || null,
        areaSqm: cfg.isEstate && form.area ? displayToArea(Number(form.area)) : null,
        remark: form.remark || null,
        tagIds, // 持仓标签：新建/编辑均保存（新建时同一组标签打到买入流水上）
        projectId: form.projectId || null,
        direction: (cfg.isLoan ? (form.direction || null) : null) as "lend" | "borrow" | null,
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

        {cfg.isMetal && (
          <div>
            <label className={labelCls}>{t("investment.subType")}</label>
            <select value={form.subType} onChange={(e) => set("subType", e.target.value)} className={inputCls}>
              {METAL_SUB_TYPES.map((s) => (
                <option key={s.v} value={s.v}>{s.icon} {t(s.key)}</option>
              ))}
            </select>
          </div>
        )}

        {cfg.showCode && (
          <div>
            <label className={labelCls}>{t("investment.code")}{cfg.codeRequired && <span className="text-red-500">*</span>}</label>
            <input value={form.code} onChange={(e) => set("code", e.target.value)} className={inputCls} />
          </div>
        )}

        {!cfg.isEstate && !cfg.isFixedIncome && (
          <div>
            <label className={labelCls}>{t(cfg.qtyLabelKey)}{cfg.qtyRequired && <span className="text-red-500">*</span>}</label>
            <input value={form.qty} onChange={(e) => set("qty", e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
        )}

        <div>
          <label className={labelCls}>{cfg.isFixedIncome ? t("investment.principal") : t("investment.costAmount")} <span className="text-red-500">*</span></label>
          <input value={form.costYuan} onChange={(e) => set("costYuan", e.target.value)} inputMode="decimal" className={inputCls} />
        </div>

        {/* 定期存款：不显示「当前市值」（市值 = 本金），保存时自动取本金 */}
        {!cfg.isDeposit && (
          <div>
            <label className={labelCls}>{cfg.isEstate ? t("investment.currentAppraisal") : t("investment.valueAmount")} <span className="text-red-500">*</span></label>
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

        {!cfg.isFixedIncome && !cfg.isEstate && (
          <div>
            <label className={labelCls}>{t("investment.fee")} <span className="text-red-500">*</span></label>
            <input value={form.feeYuan} onChange={(e) => set("feeYuan", e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
        )}

        {cfg.isFixedIncome && (
          <div>
            <label className={labelCls}>{t("investment.interestRate")}{cfg.isInsurance && <span className="text-red-500">*</span>}</label>
            <input value={form.interestRate} onChange={(e) => set("interestRate", e.target.value)} placeholder="2.60%" className={inputCls} />
          </div>
        )}

        <div>
          <label className={labelCls}>{cfg.isFixedIncome ? t("investment.startDate") : t("investment.purchaseDate")} <span className="text-red-500">*</span></label>
          <input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className={inputCls} />
        </div>

        {cfg.isFixedIncome && (
          <div>
            <label className={labelCls}>{t("investment.maturityDate")}{cfg.isInsurance && <span className="text-red-500">*</span>}</label>
            <input type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} className={inputCls} />
          </div>
        )}

        {cfg.isEstate && (
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

        {cfg.isLoan && (
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("investment.direction")} <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {(["lend", "borrow"] as const).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`rounded-lg border px-4 py-2 text-sm ${form.direction === d ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {d === "lend" ? t("investment.lend") : t("investment.borrow")}
                </button>
              ))}
            </div>
          </div>
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
          <label className={labelCls}>{cfg.isLoan && form.direction === "borrow" ? t("investment.receiveAccount") : t("investment.paymentAccount")} <span className="text-red-500">*</span></label>
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
