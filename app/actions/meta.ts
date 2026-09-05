"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, tags, projects } from "@/db/schema";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";

/* ===== 分类 / Categories ===== */
export async function createCategory(input: {
  name: string;
  type: "income" | "expense";
  icon?: string;
  remark?: string;
}) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  if (!input.name.trim()) return { ok: false as const, error: "errors.nameRequired" };
  await withAudit(
    { userId: user.id, action: "C", entity: "category", summary: `新增分类 ${input.name}`, requestBody: JSON.stringify({ name: input.name, type: input.type, icon: input.icon ?? "📦", remark: input.remark ?? "" }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(categories).values({
        ledgerId, name: input.name.trim(), type: input.type,
        icon: input.icon ?? "📦", remark: input.remark ?? "",
      });
    },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

export async function deleteCategory(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  await withAudit(
    { userId: user.id, action: "D", entity: "category", entityId: id, summary: "删除分类", requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(categories).where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId))); },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/** 更新分类 / Update category */
export async function updateCategory(id: string, input: { name: string; type: "income" | "expense"; icon?: string; remark?: string }) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  if (!input.name.trim()) return { ok: false as const, error: "errors.nameRequired" };
  await withAudit(
    { userId: user.id, action: "U", entity: "category", entityId: id, summary: `修改分类 ${input.name}`, requestBody: JSON.stringify({ id, name: input.name, type: input.type, icon: input.icon ?? "📦", remark: input.remark ?? "" }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(categories).set({
        name: input.name.trim(), type: input.type,
        icon: input.icon ?? "📦", remark: input.remark ?? "",
      }).where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));
    },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/* ===== 标签 / Tags ===== */
export async function createTag(input: { name: string; color?: string; remark?: string }) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  if (!input.name.trim()) return { ok: false as const, error: "errors.tagNameRequired" };
  await withAudit(
    { userId: user.id, action: "C", entity: "tag", summary: `新增标签 ${input.name}`, requestBody: JSON.stringify({ name: input.name, color: input.color ?? "#0d9488", remark: input.remark ?? "" }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(tags).values({ ledgerId, name: input.name.trim(), color: input.color ?? "#0d9488", remark: input.remark ?? "" });
    },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

export async function deleteTag(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  await withAudit(
    { userId: user.id, action: "D", entity: "tag", entityId: id, summary: "删除标签", requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(tags).where(and(eq(tags.id, id), eq(tags.ledgerId, ledgerId))); },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/** 更新标签 / Update tag */
export async function updateTag(id: string, input: { name: string; color?: string; remark?: string }) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  if (!input.name.trim()) return { ok: false as const, error: "errors.tagNameRequired" };
  await withAudit(
    { userId: user.id, action: "U", entity: "tag", entityId: id, summary: `修改标签 ${input.name}`, requestBody: JSON.stringify({ id, name: input.name, color: input.color, remark: input.remark ?? "" }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(tags).set({ name: input.name.trim(), color: input.color ?? "#0d9488", remark: input.remark ?? "" }).where(and(eq(tags.id, id), eq(tags.ledgerId, ledgerId)));
    },
  );
  revalidatePath("/tags");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/* ===== 项目 / Projects ===== */
const projSchema = z.object({
  name: z.string().min(1).max(30),
  icon: z.string().max(4).optional(),
  budgetYuan: z.string().optional(),
  status: z.string().optional(),
  remark: z.string().max(200).optional(),
});

export async function createProject(input: z.infer<typeof projSchema>) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  const parsed = projSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const budgetCents = d.budgetYuan ? yuanToCents(d.budgetYuan) : 0;
  await withAudit(
    { userId: user.id, action: "C", entity: "project", summary: `新增项目 ${d.name}`, requestBody: JSON.stringify({ name: d.name, icon: d.icon ?? "📁", budgetYuan: d.budgetYuan ?? null, status: d.status ?? "active", remark: d.remark ?? null }), responseBody: '{"result":"created"}' },
    async (tx) => {
      await tx.insert(projects).values({
        ledgerId, name: d.name, icon: d.icon ?? "📁",
        budgetCents: budgetCents ?? 0, status: d.status ?? "active",
        remark: d.remark ?? null, createdBy: user.id,
      });
    },
  );
  revalidatePath("/projects");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/** 更新项目 / Update project */
export async function updateProject(id: string, input: z.infer<typeof projSchema>) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  const parsed = projSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const budgetCents = d.budgetYuan ? yuanToCents(d.budgetYuan) : 0;
  await withAudit(
    { userId: user.id, action: "U", entity: "project", entityId: id, summary: `更新项目 ${d.name}`, requestBody: JSON.stringify({ id, name: d.name, icon: d.icon ?? "📁", budgetYuan: d.budgetYuan ?? null, status: d.status ?? "active", remark: d.remark ?? null }), responseBody: '{"result":"updated"}' },
    async (tx) => {
      await tx.update(projects).set({
        name: d.name, icon: d.icon ?? "📁",
        budgetCents: budgetCents ?? 0, status: d.status ?? "active",
        remark: d.remark ?? null,
      }).where(and(eq(projects.id, id), eq(projects.ledgerId, ledgerId)));
    },
  );
  revalidatePath("/projects");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}

/** 删除项目（不删关联流水，仅置空）/ Delete project (keep transactions) */
export async function deleteProject(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, "editor");
  await withAudit(
    { userId: user.id, action: "D", entity: "project", entityId: id, summary: "删除项目（关联流水保留）", requestBody: JSON.stringify({ id }), responseBody: '{"result":"deleted"}' },
    async (tx) => { await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.ledgerId, ledgerId))); },
  );
  revalidatePath("/projects");
  revalidatePath("/add");
  revalidatePath("/reports");
  return { ok: true as const, error: null };
}
