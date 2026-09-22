// ratcount · 基础字典业务服务（项目 / 标签 / 币种）/ Business services for basic dictionaries (projects / tags / currencies)
//  - 从 app/actions/projects|tags|settings/currencies 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），
//    服务端 action 与桌面主进程 IPC 共用同一份，保证双模式行为一致。
//  - 只接收调用方注入的 actor 与 ledgerId，不碰 cookie/redirect/Auth.js；revalidatePath 由调用方负责。
//  - Extracted "validate + audit + write" logic from the actions (no 'use server'); shared by server action and desktop IPC.
//    Takes actor/ledgerId injected by the caller; no cookie/redirect/Auth.js; revalidatePath is the caller's job.
import { and, eq, inArray } from "drizzle-orm";
import { accounts, currencies, projects, tags, transactions, transactionTags } from "@/db/schema";
import { AUDIT_ACTION, ENTITY, PROJECT_STATUS } from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { type Actor } from "./guard";
import {
  currencySchema,
  projectSchema,
  tagSchema,
  type CurrencyInput,
  type CurrencyUpdateInput,
  type ProjectInput,
  type TagInput,
} from "@/lib/validators/basics";

type Ok = { ok: true; error: null };
type Fail = { ok: false; error: string };
export type ServiceResult = Ok | Fail;

/* ===================== 项目 / Projects ===================== */

export async function createProjectService(actor: Actor, ledgerId: string, input: ProjectInput): Promise<ServiceResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  const budgetCents = d.budgetYuan ? yuanToCents(d.budgetYuan) : 0;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.project,
      summaryKey: "audit.projectCreated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({
        name: d.name,
        icon: d.icon ?? "📁",
        budgetYuan: d.budgetYuan ?? null,
        status: d.status ?? PROJECT_STATUS.active,
        remark: d.remark ?? null,
      }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(projects).values({
        ledgerId,
        name: d.name,
        icon: d.icon ?? "📁",
        budgetCents: budgetCents ?? 0,
        status: d.status ?? PROJECT_STATUS.active,
        remark: d.remark ?? null,
        createdBy: actor.id,
      });
    },
  );
  return { ok: true, error: null };
}

export async function updateProjectService(actor: Actor, ledgerId: string, id: string, input: ProjectInput): Promise<ServiceResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  const budgetCents = d.budgetYuan ? yuanToCents(d.budgetYuan) : 0;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.project,
      entityId: id,
      summaryKey: "audit.projectUpdated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({
        id,
        name: d.name,
        icon: d.icon ?? "📁",
        budgetYuan: d.budgetYuan ?? null,
        status: d.status ?? PROJECT_STATUS.active,
        remark: d.remark ?? null,
      }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .update(projects)
        .set({
          name: d.name,
          icon: d.icon ?? "📁",
          budgetCents: budgetCents ?? 0,
          status: d.status ?? PROJECT_STATUS.active,
          remark: d.remark ?? null,
        })
        .where(and(eq(projects.id, id), eq(projects.ledgerId, ledgerId)));
    },
  );
  return { ok: true, error: null };
}

/** 删除项目（不删关联流水，仅置空）/ Delete project (keep transactions; null out references) */
export async function deleteProjectService(actor: Actor, ledgerId: string, id: string): Promise<ServiceResult> {
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.project,
      entityId: id,
      summaryKey: "audit.projectDeleted",
      summaryParams: {},
      requestBody: JSON.stringify({ id }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx
        .update(transactions)
        .set({ projectId: null })
        .where(and(eq(transactions.projectId, id), eq(transactions.ledgerId, ledgerId)));
      await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.ledgerId, ledgerId)));
    },
  );
  return { ok: true, error: null };
}

/* ===================== 标签 / Tags ===================== */

export async function createTagService(actor: Actor, ledgerId: string, input: TagInput): Promise<ServiceResult> {
  if (!input.name.trim()) return { ok: false, error: "errors.tagNameRequired" };
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.tag,
      summaryKey: "audit.tagCreated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ name: d.name, color: d.color ?? "#0d9488", remark: d.remark ?? "" }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(tags).values({ ledgerId, name: d.name, color: d.color ?? "#0d9488", remark: d.remark ?? "" });
    },
  );
  return { ok: true, error: null };
}

export async function updateTagService(actor: Actor, ledgerId: string, id: string, input: TagInput): Promise<ServiceResult> {
  if (!input.name.trim()) return { ok: false, error: "errors.tagNameRequired" };
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.tag,
      entityId: id,
      summaryKey: "audit.tagUpdated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ id, name: d.name, color: d.color, remark: d.remark ?? "" }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .update(tags)
        .set({ name: d.name, color: d.color ?? "#0d9488", remark: d.remark ?? "" })
        .where(and(eq(tags.id, id), eq(tags.ledgerId, ledgerId)));
    },
  );
  return { ok: true, error: null };
}

/** 删除标签（先校验归属防越权，再级联清理流水↔标签关联）/ Delete tag (verify ownership, then cascade-clear tx↔tag links) */
export async function deleteTagService(actor: Actor, ledgerId: string, id: string): Promise<ServiceResult> {
  const [owned] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.ledgerId, ledgerId)))
    .limit(1);
  if (!owned) return { ok: false, error: "errors.invalidInput" };
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.tag,
      entityId: id,
      summaryKey: "audit.tagDeleted",
      summaryParams: {},
      requestBody: JSON.stringify({ id }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx.delete(transactionTags).where(eq(transactionTags.tagId, id));
      await tx.delete(tags).where(and(eq(tags.id, id), eq(tags.ledgerId, ledgerId)));
    },
  );
  return { ok: true, error: null };
}

/* ===================== 币种 / Currencies（全局，admin 级） ===================== */

export async function createCurrencyService(actor: Actor, input: CurrencyInput): Promise<ServiceResult> {
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  const r = parseFloat(d.rate);
  if (!isFinite(r) || r <= 0) return { ok: false, error: "errors.rateInvalid" };

  const [existing] = await db.select().from(currencies).where(eq(currencies.code, d.code)).limit(1);
  if (existing) return { ok: false, error: "errors.currencyExists" };

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.currency,
      entityId: d.code,
      summaryKey: "audit.currencyCreated",
      summaryParams: { code: d.code, name: d.name },
      requestBody: JSON.stringify({ code: d.code, symbol: d.symbol, name: d.name, rate: d.rate, remark: d.remark ?? "" }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(currencies).values({
        code: d.code,
        symbol: d.symbol,
        name: d.name,
        rate: d.rate,
        isActive: d.isActive ?? true,
        remark: d.remark ?? "",
      });
    },
  );
  return { ok: true, error: null };
}

export async function updateCurrencyService(actor: Actor, code: string, input: CurrencyUpdateInput): Promise<ServiceResult> {
  const parsed = currencySchema.omit({ code: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;
  const r = parseFloat(d.rate);
  if (!isFinite(r) || r <= 0) return { ok: false, error: "errors.rateInvalid" };

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.currency,
      entityId: code,
      summaryKey: "audit.currencyUpdated",
      summaryParams: { code },
      requestBody: JSON.stringify({ code, symbol: d.symbol, name: d.name, rate: d.rate, isActive: d.isActive, remark: d.remark ?? "" }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .update(currencies)
        .set({
          symbol: d.symbol,
          name: d.name,
          rate: d.rate,
          isActive: d.isActive ?? true,
          remark: d.remark ?? "",
          updatedBy: actor.id,
        })
        .where(eq(currencies.code, code));
    },
  );
  return { ok: true, error: null };
}

/** 删除币种（禁止删除基准币种和已被账户引用的币种）/ Delete currency (block base currency and currencies referenced by accounts) */
export async function deleteCurrencyService(actor: Actor, code: string): Promise<ServiceResult> {
  const [cur] = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!cur) return { ok: false, error: "errors.currencyNotFound" };
  if (cur.isBase) return { ok: false, error: "errors.baseCurrencyNotDeletable" };

  const [used] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.currencyCode, code)).limit(1);
  if (used) return { ok: false, error: "errors.currencyInUse" };

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.currency,
      entityId: code,
      summaryKey: "audit.currencyDeleted",
      summaryParams: { code },
      requestBody: JSON.stringify({ code }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx.delete(currencies).where(eq(currencies.code, code));
    },
  );
  return { ok: true, error: null };
}

/** 更新币种汇率 / Update currency rate */
export async function updateCurrencyRateService(actor: Actor, code: string, rate: string): Promise<ServiceResult> {
  const r = parseFloat(rate);
  if (!isFinite(r) || r <= 0) return { ok: false, error: "errors.rateInvalid" };
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.currency,
      entityId: code,
      summaryKey: "audit.currencyRateUpdated",
      summaryParams: { code, rate },
      requestBody: JSON.stringify({ code, rate }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(currencies).set({ rate, updatedBy: actor.id }).where(inArray(currencies.code, [code]));
    },
  );
  return { ok: true, error: null };
}

/** 启用/停用币种 / Toggle currency active */
export async function toggleCurrencyService(actor: Actor, code: string, isActive: boolean): Promise<ServiceResult> {
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.currency,
      entityId: code,
      summaryKey: isActive ? "audit.currencyEnabled" : "audit.currencyDisabled",
      summaryParams: { code },
      requestBody: JSON.stringify({ code, isActive }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(currencies).set({ isActive, updatedBy: actor.id }).where(inArray(currencies.code, [code]));
    },
  );
  return { ok: true, error: null };
}
