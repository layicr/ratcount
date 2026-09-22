// ratcount · 分类业务服务 / Category business service
//  - 从 app/actions/categories 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { transactions, categories } from "@/db/schema";
import { AUDIT_ACTION, ENTITY, TX } from "@/lib/constants";
import { withAudit } from "@/lib/audit";
import { type Actor } from "./guard";

const categorySchema = z.object({
  name: z.string().trim().min(1, "errors.nameRequired").max(30),
  type: z.enum([TX.income, TX.expense]),
  icon: z.string().max(8).optional(),
  remark: z.string().max(200).optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

/* ===================== 分类 / Categories ===================== */

export async function createCategoryService(actor: Actor, ledgerId: string, input: CategoryInput) {
  if (!input.name.trim()) return { ok: false as const, error: "errors.nameRequired" };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.category,
      summaryKey: "audit.categoryCreated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ name: d.name, type: d.type, icon: d.icon ?? "📦", remark: d.remark ?? "" }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(categories).values({ ledgerId, name: d.name, type: d.type, icon: d.icon ?? "📦", remark: d.remark ?? "" });
    },
  );
  return { ok: true as const, error: null };
}

export async function updateCategoryService(actor: Actor, ledgerId: string, id: string, input: CategoryInput) {
  if (!input.name.trim()) return { ok: false as const, error: "errors.nameRequired" };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.category,
      entityId: id,
      summaryKey: "audit.categoryUpdated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ id, name: d.name, type: d.type, icon: d.icon ?? "📦", remark: d.remark ?? "" }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .update(categories)
        .set({ name: d.name, type: d.type, icon: d.icon ?? "📦", remark: d.remark ?? "" })
        .where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}

/** 删除分类（级联将关联流水 categoryId 置空）/ Delete category (null out references in transactions) */
export async function deleteCategoryService(actor: Actor, ledgerId: string, id: string) {
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.category,
      entityId: id,
      summaryKey: "audit.categoryDeleted",
      summaryParams: {},
      requestBody: JSON.stringify({ id }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await tx.update(transactions).set({ categoryId: null }).where(and(eq(transactions.categoryId, id), eq(transactions.ledgerId, ledgerId)));
      await tx.delete(categories).where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));
    },
  );
  return { ok: true as const, error: null };
}
