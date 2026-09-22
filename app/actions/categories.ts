"use server";

// ratcount · 分类写操作（薄封装）/ Category writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/categories；此处仅做「守卫 + 当前账本 + revalidatePath」，服务端行为零回归。
import { MR } from "@/lib/constants";
import { requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import * as svc from "@/lib/services/categories";
import type { CategoryInput } from "@/lib/services/categories";
import { revalidatePath } from "next/cache";

export async function createCategory(input: CategoryInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await svc.createCategoryService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) {
    revalidatePath("/categories");
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath("/reports");
  }
  return r;
}

export async function updateCategory(id: string, input: CategoryInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await svc.updateCategoryService({ id: user.id, role: user.role }, ledgerId, id, input);
  if (r.ok) {
    revalidatePath("/categories");
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath("/reports");
  }
  return r;
}

export async function deleteCategory(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await svc.deleteCategoryService({ id: user.id, role: user.role }, ledgerId, id);
  if (r.ok) {
    revalidatePath("/categories");
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath("/reports");
  }
  return r;
}
