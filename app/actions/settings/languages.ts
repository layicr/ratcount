"use server";

// ratcount · 语言写操作（薄封装）/ Language writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/settings；此处仅做「守卫 + revalidatePath」，服务端行为零回归。
import { requireAdmin } from "@/lib/scope";
import { SETTINGS_LANGUAGES_PATH } from "@/lib/constants";
import * as svc from "@/lib/services/settings";
import type { LanguageInput, LanguageUpdateInput } from "@/lib/services/settings";
import { revalidatePath } from "next/cache";

export async function createLanguage(input: LanguageInput) {
  const user = await requireAdmin();
  const r = await svc.createLanguageService({ id: user.id, role: user.role }, input);
  if (r.ok) revalidatePath(SETTINGS_LANGUAGES_PATH);
  return r;
}

export async function updateLanguage(code: string, input: LanguageUpdateInput) {
  const user = await requireAdmin();
  const r = await svc.updateLanguageService({ id: user.id, role: user.role }, code, input);
  if (r.ok) revalidatePath(SETTINGS_LANGUAGES_PATH);
  return r;
}

export async function toggleLanguage(code: string, isEnabled: boolean) {
  const user = await requireAdmin();
  const r = await svc.toggleLanguageService({ id: user.id, role: user.role }, code, isEnabled);
  if (r.ok) revalidatePath(SETTINGS_LANGUAGES_PATH);
  return r;
}

export async function deleteLanguage(code: string) {
  const user = await requireAdmin();
  const r = await svc.deleteLanguageService({ id: user.id, role: user.role }, code);
  if (r.ok) revalidatePath(SETTINGS_LANGUAGES_PATH);
  return r;
}
