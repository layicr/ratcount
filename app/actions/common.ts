"use server";

// ratcount · 基础字典合并入口（项目 / 标签 / 币种）/ Consolidated entry for basic dictionaries (projects / tags / currencies)
//  - 原 app/actions/projects.ts、tags.ts、settings/currencies.ts 的写逻辑已抽到 lib/services/basics，
//    此处仅做「守卫 + 当前账本 + revalidatePath」薄封装，保证服务端行为与历史一致（零回归）。
//  - The write logic moved to lib/services/basics; this file is just a thin "guard + current ledger + revalidatePath" wrapper.
import { revalidatePath } from "next/cache";
import { MR, SETTINGS_PATH, SETTINGS_CURRENCIES_PATH, REPORTS_PATH } from "@/lib/constants";
import { requireAdmin, requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedgerId } from "@/lib/ledger";
import * as basics from "@/lib/services/basics";
import type { CurrencyInput, CurrencyUpdateInput, ProjectInput, TagInput } from "@/lib/validators/basics";

/* ===================== 项目 / Projects ===================== */

export async function createProject(input: ProjectInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.createProjectService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) {
    revalidatePath("/projects");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

export async function updateProject(id: string, input: ProjectInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.updateProjectService({ id: user.id, role: user.role }, ledgerId, id, input);
  if (r.ok) {
    revalidatePath("/projects");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

export async function deleteProject(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.deleteProjectService({ id: user.id, role: user.role }, ledgerId, id);
  if (r.ok) {
    revalidatePath("/projects");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

/* ===================== 标签 / Tags ===================== */

export async function createTag(input: TagInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.createTagService({ id: user.id, role: user.role }, ledgerId, input);
  if (r.ok) {
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

export async function updateTag(id: string, input: TagInput) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.updateTagService({ id: user.id, role: user.role }, ledgerId, id, input);
  if (r.ok) {
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

export async function deleteTag(id: string) {
  const ledgerId = await getCurrentLedgerId();
  if (!ledgerId) return { ok: false as const, error: "errors.noLedger" };
  const { user } = await requireLedgerAccess(ledgerId, MR.editor);
  const r = await basics.deleteTagService({ id: user.id, role: user.role }, ledgerId, id);
  if (r.ok) {
    revalidatePath("/tags");
    revalidatePath("/add");
    revalidatePath(REPORTS_PATH);
  }
  return r;
}

/* ===================== 币种 / Currencies（全局，admin 级） ===================== */

export async function createCurrency(input: CurrencyInput) {
  const user = await requireAdmin();
  const r = await basics.createCurrencyService({ id: user.id, role: user.role }, input);
  if (r.ok) revalidatePath(SETTINGS_CURRENCIES_PATH);
  return r;
}

export async function updateCurrency(code: string, input: CurrencyUpdateInput) {
  const user = await requireAdmin();
  const r = await basics.updateCurrencyService({ id: user.id, role: user.role }, code, input);
  if (r.ok) revalidatePath(SETTINGS_CURRENCIES_PATH);
  return r;
}

export async function deleteCurrency(code: string) {
  const user = await requireAdmin();
  const r = await basics.deleteCurrencyService({ id: user.id, role: user.role }, code);
  if (r.ok) revalidatePath(SETTINGS_CURRENCIES_PATH);
  return r;
}

export async function updateCurrencyRate(code: string, rate: string) {
  const user = await requireAdmin();
  const r = await basics.updateCurrencyRateService({ id: user.id, role: user.role }, code, rate);
  if (r.ok) revalidatePath(SETTINGS_PATH);
  return r;
}

export async function toggleCurrency(code: string, isActive: boolean) {
  const user = await requireAdmin();
  const r = await basics.toggleCurrencyService({ id: user.id, role: user.role }, code, isActive);
  if (r.ok) revalidatePath(SETTINGS_PATH);
  return r;
}
