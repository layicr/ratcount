// ratcount · 投资持仓 业务服务 / Investment holdings business services
//  - 从 app/actions/investments.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie），
//    服务端 action 与桌面 IPC 共用。签名显式接收 actor 与 ledgerId，便于双模式注入。
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { transactions, transactionTags, tags, holdingTags, investmentHoldings, accounts } from "@/db/schema";
import { investmentTypes, metalSubTypes, INV, MR, AUDIT_ACTION, ENTITY, INVESTMENT_STATUS, TX, DEFAULT_CURRENCY } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit, getDefaultTranslator } from "@/lib/audit";
import { ensureCategory, type Tx, assertRefsInLedger, RefNotInLedgerError } from "@/lib/ledger-refs";
import { yuanToCents, centsToYuan } from "@/lib/money";
import { loadCurrencyRates, rateOf, toBaseCents } from "@/lib/currency";
import { resolveTransactionMoney } from "@/lib/tx-currency";
import { actualCostCents, profitCents, prorateSell, todayStr, isDateStr, daysBetween } from "@/lib/investment-flow";
import { fmtDate, parseDate } from "@/lib/recurring";
import { type Actor } from "./guard";

/** 日期格式 YYYY-MM-DD（可空） */
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").nullable().optional();

/** 持仓状态被并发抢先变更，整体回滚 */
class InvestmentConcurrentError extends Error {
  constructor() { super("investment status changed concurrently"); this.name = "InvestmentConcurrentError"; }
}

/** 投资持仓表单输入：金额为「元」字符串（与账户期初一致），由服务端转分 */
const investmentSchema = z.object({
  type: z.enum(investmentTypes), // 白名单：stock/fund/deposit/bond/metal/real_estate
  subType: z.enum(metalSubTypes).nullable().optional(), // 贵金属：gold/silver
  name: z.string().min(1).max(60),
  code: z.string().max(20).nullable().optional(),
  accountId: z.string().min(1), // 关联账户（必填）
  paymentAccountId: z.string().min(1), // 扣款账户（必填）
  quantity: z.number().int().min(0).max(1_000_000_000_000), // 整数存储（股数 / 份额×10000 / 克×100 / 面积×100）
  costYuan: z.string().min(1).max(20), // 买入成本（元）；上限由 yuanToCents（MAX_ABS_CENTS）兜底
  feeYuan: z.string().max(20).optional(), // 交易费用（元）
  valueYuan: z.string().min(1).max(20), // 当前市值（元）
  purchaseDate: dateStr,
  maturityDate: dateStr,
  interestRate: z.string().max(20).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  areaSqm: z.number().int().min(0).max(100_000_000).nullable().optional(),
  remark: z.string().max(200).nullable().optional(),
  tagIds: z.array(z.string()).optional(), // 持仓标签（新建时同一组标签同时打到「买入/存入」流水上）
  projectId: z.string().min(1).nullable().optional(), // 归属项目（可选）
});

export type InvestmentInput = z.infer<typeof investmentSchema>;

/** 元 → 分，非法输入返回 null */
function toCents(yuan: string): number | null {
  return yuanToCents(yuan);
}

/** 流水打标签：仅允许本账本标签（防跨账本越权注入），无标签则跳过 */
async function linkTags(tx: Tx, ledgerId: string, tagIds: string[] | undefined, txId: string) {
  if (!tagIds || tagIds.length === 0) return;
  const valid = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.ledgerId, ledgerId), inArray(tags.id, tagIds)));
  const validIds = new Set(valid.map((v) => v.id));
  const rows = tagIds.filter((id) => validIds.has(id)).map((tagId) => ({ transactionId: txId, tagId }));
  if (rows.length > 0) await tx.insert(transactionTags).values(rows);
}

/** 持仓打标签：整体替换（先删后插），仅允许本账本标签（防跨账本越权注入） */
async function replaceHoldingTags(tx: Tx, ledgerId: string, holdingId: string, tagIds: string[] | undefined) {
  await tx.delete(holdingTags).where(eq(holdingTags.holdingId, holdingId));
  if (!tagIds || tagIds.length === 0) return;
  const valid = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.ledgerId, ledgerId), inArray(tags.id, tagIds)));
  const validIds = new Set(valid.map((v) => v.id));
  const rows = tagIds.filter((id) => validIds.has(id)).map((tagId) => ({ holdingId, tagId }));
  if (rows.length > 0) await tx.insert(holdingTags).values(rows);
}

/* ===================== 新增 / Create ===================== */

export async function createInvestmentService(actor: Actor, ledgerId: string, input: InvestmentInput) {
  const parsed = investmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  const costCents = toCents(d.costYuan);
  const valueCents = toCents(d.valueYuan);
  const feeCents = d.feeYuan ? toCents(d.feeYuan) : 0;
  if (costCents === null || valueCents === null || feeCents === null) {
    return { ok: false as const, error: "errors.invalidInput" };
  }

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.investment,
        summaryKey: "audit.investmentCreated", summaryParams: { name: d.name },
        requestBody: JSON.stringify({ type: d.type, subType: d.subType ?? null, name: d.name, costYuan: d.costYuan, valueYuan: d.valueYuan }),
        responseBody: '{"result":"created"}',
      },
      async (tx) => {
        await insertHoldingCore(tx, ledgerId, actor.id, d);
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 复制 / Copy（与新增共用 insertHoldingCore） ===================== */

/**
 * 插入一条持仓并联动生成「买入」转账流水、复制持仓标签，返回新持仓 id。
 * create 与 copy 共用，保证买流水 / 标签逻辑单一真源（DRY，降低回归风险）。
 * Insert a holding + its "buy" transfer + holding tags; returns the new holding id.
 * Shared by create and copy so the buy-flow / tag logic has a single source of truth.
 */
async function insertHoldingCore(
  tx: Tx, ledgerId: string, actorId: string, input: InvestmentInput,
): Promise<{ holdingId: string }> {
  await assertRefsInLedger(tx, ledgerId, {
    accountId: input.accountId,
    paymentAccountId: input.paymentAccountId,
    projectId: input.projectId ?? null,
    tagIds: input.tagIds ?? [],
  });
  const costCents = toCents(input.costYuan);
  const valueCents = toCents(input.valueYuan);
  const feeCents = input.feeYuan ? toCents(input.feeYuan) : 0;
  // 与 create 一致的兜底校验：分值非法时中断事务，由调用方回滚并返回 invalidInput
  if (costCents === null || valueCents === null || feeCents === null) {
    throw new Error("investment cents invalid");
  }
  const rates = await loadCurrencyRates();
  const t0 = getDefaultTranslator();
  const accts = await tx.select({ id: accounts.id, currencyCode: accounts.currencyCode })
    .from(accounts).where(inArray(accounts.id, [input.accountId, input.paymentAccountId]));
  const holdingCur = accts.find((a) => a.id === input.accountId)?.currencyCode ?? DEFAULT_CURRENCY;
  const holdingRate = rateOf(rates, holdingCur);
  const [holding] = await tx.insert(investmentHoldings).values({
    ledgerId, createdBy: actorId,
    type: input.type, subType: input.subType ?? null, name: input.name, code: input.code ?? null,
    accountId: input.accountId, paymentAccountId: input.paymentAccountId,
    quantity: input.quantity, costCents, feeCents, currentValueCents: valueCents,
    currencyCode: holdingCur, usedRate: holdingRate,
    baseCostCents: toBaseCents(costCents, holdingRate),
    baseFeeCents: toBaseCents(feeCents, holdingRate),
    baseValueCents: toBaseCents(valueCents, holdingRate),
    baseDividendCents: 0,
    purchaseDate: input.purchaseDate ?? null, maturityDate: input.maturityDate ?? null,
    interestRate: input.interestRate ?? null, location: input.location ?? null,
    areaSqm: input.areaSqm ?? null, remark: input.remark ?? null, projectId: input.projectId ?? null,
  }).returning({ id: investmentHoldings.id });
  await replaceHoldingTags(tx, ledgerId, holding.id, input.tagIds);

  const buyCents = actualCostCents(costCents, feeCents);
  if (input.paymentAccountId !== input.accountId && buyCents > 0) {
    const buyMoney = await resolveTransactionMoney(tx, ledgerId, {
      accountId: input.paymentAccountId, toAccountId: input.accountId,
      amountCents: buyCents, type: TX.transfer, rates,
    });
    const [buyTx] = await tx.insert(transactions).values({
      ledgerId, accountId: input.paymentAccountId, toAccountId: input.accountId,
      type: TX.transfer, categoryId: null, projectId: null, amountCents: buyCents,
      txDate: input.purchaseDate ?? todayStr(), remark: t0("investment.buyRemark", { name: input.name }), createdBy: actorId,
      ...buyMoney,
    }).returning({ id: transactions.id });
    await linkTags(tx, ledgerId, input.tagIds, buyTx.id);
    // 写回买入流水指针，供后续编辑按 id 精确改写 / 删除（避免特征反查漏命中或重复记账）
    await tx.update(investmentHoldings).set({ buyTransactionId: buyTx.id })
      .where(eq(investmentHoldings.id, holding.id));
  }
  return { holdingId: holding.id };
}

/**
 * 复制持仓：读取源持仓（仅 active 可复制）→ 构造同源输入（名称加 copiedLabel、买入/起息日=今天、
 * 到期日按原期限顺延、状态重置 active、累计派息清零）→ 复用 insertHoldingCore 生成新持仓 + 买入流水 + 复制标签。
 * Copy a holding: read source (active only) → build same-shape input (name + copiedLabel, purchase/start date = today,
 * maturity extended by original term, status reset to active, dividends cleared) → reuse insertHoldingCore.
 */
export async function copyInvestmentService(
  actor: Actor, ledgerId: string, id: string, copiedLabel: string,
): Promise<{ ok: true; error: null } | { ok: false; error: string }> {
  const [h] = await db.select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId))).limit(1);
  if (!h) return { ok: false as const, error: "investment.notFound" };
  if (h.status !== INVESTMENT_STATUS.active) return { ok: false as const, error: "investment.notActive" };

  const tagRows = await db.select({ tagId: holdingTags.tagId }).from(holdingTags)
    .where(eq(holdingTags.holdingId, id));
  const tagIds = tagRows.map((r) => r.tagId);

  const today = todayStr();
  let maturityDate: string | null = null;
  if (isDateStr(h.purchaseDate) && isDateStr(h.maturityDate)) {
    const span = daysBetween(h.purchaseDate, h.maturityDate);
    if (span !== null && span > 0) {
      const d = parseDate(today);
      d.setUTCDate(d.getUTCDate() + span);
      maturityDate = fmtDate(d);
    }
  }

  const input: InvestmentInput = {
    type: h.type,
    subType: (h.subType ?? undefined) as InvestmentInput["subType"],
    name: `${h.name}${copiedLabel}`,
    code: h.code ?? undefined,
    accountId: h.accountId,
    paymentAccountId: h.paymentAccountId,
    quantity: h.quantity,
    costYuan: centsToYuan(h.costCents),
    feeYuan: h.feeCents > 0 ? centsToYuan(h.feeCents) : undefined,
    valueYuan: centsToYuan(h.currentValueCents),
    purchaseDate: today,
    maturityDate,
    interestRate: h.interestRate ?? undefined,
    location: h.location ?? undefined,
    areaSqm: h.areaSqm ?? undefined,
    remark: h.remark ?? undefined,
    tagIds,
    projectId: h.projectId ?? undefined,
  };

  const parsed = investmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.create, entity: ENTITY.investment,
        summaryKey: "audit.investmentDuplicated", summaryParams: { name: d.name, source: h.name },
        requestBody: JSON.stringify({ id, sourceName: h.name, name: d.name }),
        responseBody: '{"result":"copied"}',
      },
      async (tx) => {
        await insertHoldingCore(tx, ledgerId, actor.id, d);
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 更新 / Update ===================== */

/**
 * 编辑时回写买入流水：按持仓的 buy_transaction_id 指针直接定位「买入」转账，改写 / 删除，使流水与持仓一致。
 * - buy_transaction_id 非空（新持仓）且仍满足买入条件：改写金额/账户/日期/备注/标签
 * - buy_transaction_id 非空但不再满足买入条件（扣款账户=关联账户 或 金额=0）：删除该流水（含标签）并把持仓指针置空（余额随之回滚）
 * - buy_transaction_id 为空（本功能上线前的旧持仓）：直接跳过，不碰流水（保留当前行为，不解决历史不一致）
 * Reconcile buy transfer on edit: locate the buy transfer by its id pointer, then update / delete.
 */
async function reconcileBuyFlow(
  tx: Tx, ledgerId: string,
  cur: { id: string; buyTransactionId: string | null },
  d: InvestmentInput,
) {
  // 旧持仓（无买入流水指针）：保持现状，不回写流水
  if (!cur.buyTransactionId) return;

  const newCostCents = toCents(d.costYuan) ?? 0;
  const newFeeCents = d.feeYuan ? (toCents(d.feeYuan) ?? 0) : 0;
  const newBuyCents = actualCostCents(newCostCents, newFeeCents);
  const warranted = d.paymentAccountId !== d.accountId && newBuyCents > 0;
  const rates = await loadCurrencyRates();
  const t0 = getDefaultTranslator();

  if (warranted) {
    const buyMoney = await resolveTransactionMoney(tx, ledgerId, {
      accountId: d.paymentAccountId, toAccountId: d.accountId, amountCents: newBuyCents, type: TX.transfer, rates,
    });
    await tx.update(transactions).set({
      accountId: d.paymentAccountId,
      toAccountId: d.accountId,
      amountCents: newBuyCents,
      txDate: d.purchaseDate ?? todayStr(),
      remark: t0("investment.buyRemark", { name: d.name }),
      ...buyMoney,
    }).where(eq(transactions.id, cur.buyTransactionId));
    // 标签：仅当本次编辑携带 tagIds 时才整体替换为持仓标签（与 replaceHoldingTags 行为一致）
    if (d.tagIds !== undefined) {
      await tx.delete(transactionTags).where(eq(transactionTags.transactionId, cur.buyTransactionId));
      await linkTags(tx, ledgerId, d.tagIds, cur.buyTransactionId);
    }
  } else {
    // 不再满足买入条件：删除旧买入流水（含其标签），并把持仓指针置空，余额随之回滚，保持与持仓一致
    await tx.delete(transactionTags).where(eq(transactionTags.transactionId, cur.buyTransactionId));
    await tx.delete(transactions).where(eq(transactions.id, cur.buyTransactionId));
    await tx.update(investmentHoldings).set({ buyTransactionId: null })
      .where(eq(investmentHoldings.id, cur.id));
  }
}

export async function updateInvestmentService(actor: Actor, ledgerId: string, id: string, input: InvestmentInput) {
  const parsed = investmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;

  const costCents = toCents(d.costYuan);
  const valueCents = toCents(d.valueYuan);
  const feeCents = d.feeYuan ? toCents(d.feeYuan) : 0;
  if (costCents === null || valueCents === null || feeCents === null) {
    return { ok: false as const, error: "errors.invalidInput" };
  }

  const [cur] = await db
    .select({
      status: investmentHoldings.status,
      buyTransactionId: investmentHoldings.buyTransactionId,
    })
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId)))
    .limit(1);
  if (!cur) return { ok: false as const, error: "investment.notFound" };
  if (cur.status !== INVESTMENT_STATUS.active) return { ok: false as const, error: "investment.notActive" };

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.investment, entityId: id,
        summaryKey: "audit.investmentUpdated", summaryParams: { name: d.name },
        requestBody: JSON.stringify({ id, type: d.type, name: d.name, costYuan: d.costYuan, valueYuan: d.valueYuan }),
        responseBody: '{"result":"updated"}',
      },
      async (tx) => {
        const rates = await loadCurrencyRates();
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId, paymentAccountId: d.paymentAccountId,
          projectId: d.projectId ?? null, tagIds: d.tagIds ?? [],
        });
        const accts = await tx.select({ id: accounts.id, currencyCode: accounts.currencyCode })
          .from(accounts).where(inArray(accounts.id, [d.accountId, d.paymentAccountId]));
        const holdingCur = accts.find((a) => a.id === d.accountId)?.currencyCode ?? DEFAULT_CURRENCY;
        const holdingRate = rateOf(rates, holdingCur);
        const upd = await tx.update(investmentHoldings).set({
          type: d.type, subType: d.subType ?? null, name: d.name, code: d.code ?? null,
          accountId: d.accountId, paymentAccountId: d.paymentAccountId, quantity: d.quantity,
          costCents, feeCents, currentValueCents: valueCents,
          currencyCode: holdingCur, usedRate: holdingRate,
          baseCostCents: toBaseCents(costCents, holdingRate),
          baseFeeCents: toBaseCents(feeCents, holdingRate),
          baseValueCents: toBaseCents(valueCents, holdingRate),
          purchaseDate: d.purchaseDate ?? null, maturityDate: d.maturityDate ?? null,
          interestRate: d.interestRate ?? null, location: d.location ?? null,
          areaSqm: d.areaSqm ?? null, remark: d.remark ?? null, projectId: d.projectId ?? null,
        }).where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId)));
        const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;
        if (rowsAffected === 0) throw new InvestmentConcurrentError();
        if (d.tagIds !== undefined) await replaceHoldingTags(tx, ledgerId, id, d.tagIds);
        // 编辑时回写买入流水：按 buy_transaction_id 指针保持持仓与「买入」转账一致
        await reconcileBuyFlow(tx, ledgerId, { id, buyTransactionId: cur.buyTransactionId }, d);
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    if (e instanceof InvestmentConcurrentError) return { ok: false as const, error: "investment.notFound" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 卖出 / 到期 / 派息 ===================== */

const investActionSchema = z.object({
  id: z.string().min(1),
  amountYuan: z.string().min(1),
  feeYuan: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
  txDate: dateStr,
  tagIds: z.array(z.string()).optional(),
  accountId: z.string().min(1).optional(),
});

export type InvestActionInput = z.infer<typeof investActionSchema>;

export async function sellInvestmentService(actor: Actor, ledgerId: string, input: InvestActionInput) {
  const parsed = investActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const rates = await loadCurrencyRates();

  const amountCents = toCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "errors.invalidInput" };
  const sellFeeCents = d.feeYuan ? toCents(d.feeYuan) : 0;
  if (sellFeeCents === null || sellFeeCents < 0) return { ok: false as const, error: "errors.invalidInput" };
  const netCents = amountCents - sellFeeCents;
  if (netCents < 0) return { ok: false as const, error: "errors.invalidInput" };

  const [h] = await db.select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, d.id), eq(investmentHoldings.ledgerId, ledgerId))).limit(1);
  if (!h) return { ok: false as const, error: "investment.notFound" };
  if (h.status !== INVESTMENT_STATUS.active) return { ok: false as const, error: "investment.notActive" };

  const fromAccount = h.accountId;
  const toAccount = d.accountId ?? h.paymentAccountId;
  if (fromAccount === toAccount) return { ok: false as const, error: "investment.accountPairRequired" };

  const sellQty = d.quantity ?? 0;
  if (sellQty > 0 && (h.quantity <= 0 || sellQty > h.quantity)) return { ok: false as const, error: "investment.sellQtyInvalid" };
  const split = prorateSell(
    { quantity: h.quantity, costCents: h.costCents, feeCents: h.feeCents, currentValueCents: h.currentValueCents },
    sellQty,
  );
  const cost = split.cost;
  const profit = profitCents(netCents, cost);
  const isFull = split.isFull;
  const isFixed = h.type === INV.deposit || h.type === INV.bond || h.type === INV.insurance || h.type === INV.loan;
  const nextStatus = isFixed ? INVESTMENT_STATUS.matured : INVESTMENT_STATUS.sold;
  // 自动记账的备注/类目名走 i18n：入库为用户数据，按默认语言（zh-CN）渲染（与「买入」备注一致）
  const t0 = getDefaultTranslator();
  const actionVerb = t0(isFixed ? "investment.matured" : "investment.sold");
  const txDate = d.txDate ?? todayStr();

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.investment, entityId: h.id,
        summaryKey: isFixed ? "audit.investmentMatured" : "audit.investmentSold", summaryParams: { name: h.name },
        requestBody: JSON.stringify({
          id: h.id, amountYuan: d.amountYuan, feeYuan: d.feeYuan ?? "0", txDate,
          sellQty: sellQty || null, costCents: cost, netCents, profitCents: profit, toAccount,
        }),
        responseBody: JSON.stringify({ result: isFull ? nextStatus : "partial" }),
      },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, { accountId: toAccount });
        if (cost > 0) {
          const costMoney = await resolveTransactionMoney(tx, ledgerId, {
            accountId: fromAccount, toAccountId: toAccount, amountCents: cost, type: TX.transfer, rates,
          });
          const [costTx] = await tx.insert(transactions).values({
            ledgerId, accountId: fromAccount, toAccountId: toAccount, type: TX.transfer,
            categoryId: null, projectId: null, amountCents: cost, txDate,
            remark: t0("investment.sellCostRemark", { action: actionVerb, name: h.name }), createdBy: actor.id,
            ...costMoney,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, costTx.id);
        }
        if (profit > 0) {
          const catId = await ensureCategory(tx, ledgerId, t0("investment.profitCategory"), TX.income);
          const profitMoney = await resolveTransactionMoney(tx, ledgerId, {
            accountId: toAccount, toAccountId: null, amountCents: profit, type: TX.income, rates,
          });
          const [profitTx] = await tx.insert(transactions).values({
            ledgerId, accountId: toAccount, toAccountId: null, type: TX.income, categoryId: catId,
            projectId: null, amountCents: profit, txDate,
            remark: t0("investment.sellProfitRemark", { action: actionVerb, name: h.name }), createdBy: actor.id,
            ...profitMoney,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, profitTx.id);
        } else if (profit < 0) {
          const catId = await ensureCategory(tx, ledgerId, t0("investment.lossCategory"), TX.expense);
          const lossMoney = await resolveTransactionMoney(tx, ledgerId, {
            accountId: toAccount, toAccountId: null, amountCents: Math.abs(profit), type: TX.expense, rates,
          });
          const [lossTx] = await tx.insert(transactions).values({
            ledgerId, accountId: toAccount, toAccountId: null, type: TX.expense, categoryId: catId,
            projectId: null, amountCents: Math.abs(profit), txDate,
            remark: t0("investment.sellLossRemark", { action: actionVerb, name: h.name }), createdBy: actor.id,
            ...lossMoney,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, lossTx.id);
        }
        const holdingRate = rateOf(rates, h.currencyCode);
        const upd = await tx.update(investmentHoldings).set(
          isFull
            ? { status: nextStatus, currentValueCents: netCents, baseValueCents: toBaseCents(netCents, holdingRate) }
            : {
                quantity: split.remainingQuantity, costCents: split.remainingCostCents,
                feeCents: split.remainingFeeCents, currentValueCents: split.remainingValueCents,
                baseCostCents: toBaseCents(split.remainingCostCents, holdingRate),
                baseFeeCents: toBaseCents(split.remainingFeeCents, holdingRate),
                baseValueCents: toBaseCents(split.remainingValueCents, holdingRate),
              },
        ).where(and(eq(investmentHoldings.id, h.id), eq(investmentHoldings.ledgerId, ledgerId), eq(investmentHoldings.status, INVESTMENT_STATUS.active)));
        const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;
        if (rowsAffected === 0) throw new InvestmentConcurrentError();
      },
    );
  } catch (e) {
    if (e instanceof InvestmentConcurrentError) return { ok: false as const, error: "investment.notActive" };
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

export async function dividendInvestmentService(actor: Actor, ledgerId: string, input: InvestActionInput) {
  const parsed = investActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const rates = await loadCurrencyRates();

  const amountCents = toCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "errors.invalidInput" };

  const [h] = await db.select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, d.id), eq(investmentHoldings.ledgerId, ledgerId))).limit(1);
  if (!h) return { ok: false as const, error: "investment.notFound" };
  if (h.status !== INVESTMENT_STATUS.active) return { ok: false as const, error: "investment.notActive" };

  const toAccount = d.accountId ?? h.paymentAccountId;
  const txDate = d.txDate ?? todayStr();
  // 派息自动记账的备注/类目名走 i18n：入库为用户数据，按默认语言（zh-CN）渲染
  const t0 = getDefaultTranslator();

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.investment, entityId: h.id,
        summaryKey: "audit.investmentDividend", summaryParams: { name: h.name },
        requestBody: JSON.stringify({
          id: h.id, amountYuan: d.amountYuan, txDate, toAccount,
          beforeDividendCents: h.dividendCents, afterDividendCents: h.dividendCents + amountCents,
        }),
        responseBody: '{"result":"dividended"}',
      },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, { accountId: toAccount });
        const catId = await ensureCategory(tx, ledgerId, t0("investment.profitCategory"), TX.income);
        const divMoney = await resolveTransactionMoney(tx, ledgerId, {
          accountId: toAccount, toAccountId: null, amountCents, type: TX.income, rates,
        });
        const [divTx] = await tx.insert(transactions).values({
          ledgerId, accountId: toAccount, toAccountId: null, type: TX.income, categoryId: catId,
          projectId: null, amountCents, txDate, remark: t0("investment.dividendRemark", { name: h.name }), createdBy: actor.id,
          ...divMoney,
        }).returning({ id: transactions.id });
        await linkTags(tx, ledgerId, d.tagIds, divTx.id);
        const holdingRate = rateOf(rates, h.currencyCode);
        const upd = await tx.update(investmentHoldings).set({
          currentValueCents: Math.max(0, h.currentValueCents - amountCents),
          dividendCents: h.dividendCents + amountCents,
          baseValueCents: toBaseCents(Math.max(0, h.currentValueCents - amountCents), holdingRate),
          baseDividendCents: toBaseCents(h.dividendCents + amountCents, holdingRate),
        }).where(and(
          eq(investmentHoldings.id, h.id), eq(investmentHoldings.ledgerId, ledgerId),
          eq(investmentHoldings.status, INVESTMENT_STATUS.active),
        ));
        const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;
        if (rowsAffected === 0) throw new InvestmentConcurrentError();
      },
    );
  } catch (e) {
    if (e instanceof InvestmentConcurrentError) return { ok: false as const, error: "investment.notActive" };
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 删除（软删除） / Delete ===================== */

export async function deleteInvestmentService(actor: Actor, ledgerId: string, id: string, type: string) {
  await withAudit(
    {
      userId: actor.id, action: AUDIT_ACTION.delete, entity: ENTITY.investment, entityId: id,
      summaryKey: "audit.investmentDeleted", summaryParams: {},
      requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx.update(investmentHoldings).set({ status: INVESTMENT_STATUS.deleted })
        .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}
