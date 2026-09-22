// ratcount · 投资持仓 业务服务 / Investment holdings business services
//  - 从 app/actions/investments.ts 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server' / cookie），
//    服务端 action 与桌面 IPC 共用。签名显式接收 actor 与 ledgerId，便于双模式注入。
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { transactions, transactionTags, tags, holdingTags, investmentHoldings } from "@/db/schema";
import { investmentTypes, metalSubTypes, INV, MR, AUDIT_ACTION, ENTITY, INVESTMENT_STATUS, TX } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { ensureCategory, type Tx, assertRefsInLedger, RefNotInLedgerError } from "@/lib/ledger-refs";
import { yuanToCents } from "@/lib/money";
import { actualCostCents, profitCents, prorateSell, todayStr } from "@/lib/investment-flow";
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
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId,
          paymentAccountId: d.paymentAccountId,
          projectId: d.projectId ?? null,
          tagIds: d.tagIds ?? [],
        });
        const [holding] = await tx.insert(investmentHoldings).values({
          ledgerId, createdBy: actor.id,
          type: d.type, subType: d.subType ?? null, name: d.name, code: d.code ?? null,
          accountId: d.accountId, paymentAccountId: d.paymentAccountId,
          quantity: d.quantity, costCents, feeCents, currentValueCents: valueCents,
          purchaseDate: d.purchaseDate ?? null, maturityDate: d.maturityDate ?? null,
          interestRate: d.interestRate ?? null, location: d.location ?? null,
          areaSqm: d.areaSqm ?? null, remark: d.remark ?? null, projectId: d.projectId ?? null,
        }).returning({ id: investmentHoldings.id });
        await replaceHoldingTags(tx, ledgerId, holding.id, d.tagIds);

        const buyCents = actualCostCents(costCents, feeCents);
        if (d.paymentAccountId !== d.accountId && buyCents > 0) {
          const [buyTx] = await tx.insert(transactions).values({
            ledgerId, accountId: d.paymentAccountId, toAccountId: d.accountId,
            type: TX.transfer, categoryId: null, projectId: null, amountCents: buyCents,
            txDate: d.purchaseDate ?? todayStr(), remark: `买入 ${d.name}`, createdBy: actor.id,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, buyTx.id);
        }
      },
    );
  } catch (e) {
    if (e instanceof RefNotInLedgerError) return { ok: false as const, error: "errors.refNotInLedger" };
    return { ok: false as const, error: "errors.invalidInput" };
  }
  return { ok: true as const, error: null };
}

/* ===================== 更新 / Update ===================== */

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
    .select({ status: investmentHoldings.status })
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
        await assertRefsInLedger(tx, ledgerId, {
          accountId: d.accountId, paymentAccountId: d.paymentAccountId,
          projectId: d.projectId ?? null, tagIds: d.tagIds ?? [],
        });
        const upd = await tx.update(investmentHoldings).set({
          type: d.type, subType: d.subType ?? null, name: d.name, code: d.code ?? null,
          accountId: d.accountId, paymentAccountId: d.paymentAccountId, quantity: d.quantity,
          costCents, feeCents, currentValueCents: valueCents,
          purchaseDate: d.purchaseDate ?? null, maturityDate: d.maturityDate ?? null,
          interestRate: d.interestRate ?? null, location: d.location ?? null,
          areaSqm: d.areaSqm ?? null, remark: d.remark ?? null, projectId: d.projectId ?? null,
        }).where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.ledgerId, ledgerId)));
        const rowsAffected = (upd as { rowsAffected: number }).rowsAffected ?? 0;
        if (rowsAffected === 0) throw new InvestmentConcurrentError();
        if (d.tagIds !== undefined) await replaceHoldingTags(tx, ledgerId, id, d.tagIds);
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
  const actionLabel = isFixed ? "到期" : "卖出";
  const txDate = d.txDate ?? todayStr();

  try {
    await withAudit(
      {
        userId: actor.id, action: AUDIT_ACTION.update, entity: ENTITY.investment, entityId: h.id,
        summaryKey: "audit.investmentTraded", summaryParams: { action: actionLabel, name: h.name },
        requestBody: JSON.stringify({
          id: h.id, amountYuan: d.amountYuan, feeYuan: d.feeYuan ?? "0", txDate,
          sellQty: sellQty || null, costCents: cost, netCents, profitCents: profit, toAccount,
        }),
        responseBody: JSON.stringify({ result: isFull ? nextStatus : "partial" }),
      },
      async (tx) => {
        await assertRefsInLedger(tx, ledgerId, { accountId: toAccount });
        if (cost > 0) {
          const [costTx] = await tx.insert(transactions).values({
            ledgerId, accountId: fromAccount, toAccountId: toAccount, type: TX.transfer,
            categoryId: null, projectId: null, amountCents: cost, txDate,
            remark: `${actionLabel} ${h.name}（转回成本）`, createdBy: actor.id,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, costTx.id);
        }
        if (profit > 0) {
          const catId = await ensureCategory(tx, ledgerId, "投资收益", TX.income);
          const [profitTx] = await tx.insert(transactions).values({
            ledgerId, accountId: toAccount, toAccountId: null, type: TX.income, categoryId: catId,
            projectId: null, amountCents: profit, txDate,
            remark: `${actionLabel} ${h.name}（投资收益）`, createdBy: actor.id,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, profitTx.id);
        } else if (profit < 0) {
          const catId = await ensureCategory(tx, ledgerId, "投资亏损", TX.expense);
          const [lossTx] = await tx.insert(transactions).values({
            ledgerId, accountId: toAccount, toAccountId: null, type: TX.expense, categoryId: catId,
            projectId: null, amountCents: Math.abs(profit), txDate,
            remark: `${actionLabel} ${h.name}（投资亏损）`, createdBy: actor.id,
          }).returning({ id: transactions.id });
          await linkTags(tx, ledgerId, d.tagIds, lossTx.id);
        }
        const upd = await tx.update(investmentHoldings).set(
          isFull
            ? { status: nextStatus, currentValueCents: netCents }
            : {
                quantity: split.remainingQuantity, costCents: split.remainingCostCents,
                feeCents: split.remainingFeeCents, currentValueCents: split.remainingValueCents,
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

  const amountCents = toCents(d.amountYuan);
  if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "errors.invalidInput" };

  const [h] = await db.select().from(investmentHoldings)
    .where(and(eq(investmentHoldings.id, d.id), eq(investmentHoldings.ledgerId, ledgerId))).limit(1);
  if (!h) return { ok: false as const, error: "investment.notFound" };
  if (h.status !== INVESTMENT_STATUS.active) return { ok: false as const, error: "investment.notActive" };

  const toAccount = d.accountId ?? h.paymentAccountId;
  const txDate = d.txDate ?? todayStr();

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
        const catId = await ensureCategory(tx, ledgerId, "投资收益", TX.income);
        const [divTx] = await tx.insert(transactions).values({
          ledgerId, accountId: toAccount, toAccountId: null, type: TX.income, categoryId: catId,
          projectId: null, amountCents, txDate, remark: `派息 ${h.name}（除权）`, createdBy: actor.id,
        }).returning({ id: transactions.id });
        await linkTags(tx, ledgerId, d.tagIds, divTx.id);
        const upd = await tx.update(investmentHoldings).set({
          currentValueCents: Math.max(0, h.currentValueCents - amountCents),
          dividendCents: h.dividendCents + amountCents,
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
