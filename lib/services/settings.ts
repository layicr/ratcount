// ratcount · 全局设置 / 语言 业务服务 / Global settings & language business services
//  - 从 app/actions/settings/* 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
import { eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { auditLogs as auditLogsTable, languages as languagesTable, settings as settingsTable } from "@/db/schema";
import { TIME_ZONE_CODES } from "@/i18n/timezones";
import { THEME_CODES } from "@/i18n/themes";
import {
  AUDIT_ACTION,
  ENTITY,
  GLOBAL_USER_ID,
  LOGIN_PATH,
  SETTING_KEY,
  SETTING_KEYS,
  MS_PER_DAY,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { invalidateLanguagesCache } from "@/lib/languages";
import { resolveRetentionDays } from "@/lib/audit-cleanup";
import { type Actor } from "./guard";

const languageSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  nativeName: z.string().min(1).max(60),
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).default(0),
});
export type LanguageInput = z.infer<typeof languageSchema>;
export type LanguageUpdateInput = Omit<z.infer<typeof languageSchema>, "code">;

/* ===================== 全局设置 / Global settings ===================== */

/** 更新全局设置（写操作 + 审计）/ Update a global setting */
export async function updateSettingService(actor: Actor, key: string, value: string) {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) return { ok: false as const, error: "errors.unknownSetting" };

  if (key === SETTING_KEY.auditLogRetentionDays) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 3650) return { ok: false as const, error: "errors.retentionDaysInvalid" };
  }
  if (key === SETTING_KEY.allowedPageSizes) {
    const sizes = value.split(",").map((s) => parseInt(s.trim(), 10));
    if (sizes.length === 0 || sizes.length > 10 || sizes.some((n) => isNaN(n) || n < 1 || n > 1000))
      return { ok: false as const, error: "errors.allowedPageSizesInvalid" };
  }
  if (key === SETTING_KEY.defaultPageSize) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 1000) return { ok: false as const, error: "errors.defaultPageSizeInvalid" };
  }
  if (key === SETTING_KEY.defaultTimezone && !(TIME_ZONE_CODES as readonly string[]).includes(value))
    return { ok: false as const, error: "errors.invalidInput" };
  if (key === SETTING_KEY.defaultTheme && !THEME_CODES.includes(value)) return { ok: false as const, error: "errors.invalidInput" };
  if ((key === SETTING_KEY.appName || key === SETTING_KEY.appSlogan) && value) {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false as const, error: "errors.invalidInput" };
    } catch {
      return { ok: false as const, error: "errors.invalidInput" };
    }
  }

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.setting,
      summaryKey: "audit.settingUpdated",
      summaryParams: { key, value },
      requestBody: JSON.stringify({ key, value }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx
        .insert(settingsTable)
        .values({ key, value, userId: GLOBAL_USER_ID, updatedBy: actor.id })
        .onConflictDoUpdate({ target: [settingsTable.userId, settingsTable.key], set: { value, updatedBy: actor.id } });
    },
  );
  return { ok: true as const, error: null };
}

/* ===================== 语言 / Languages ===================== */

export async function createLanguageService(actor: Actor, input: LanguageInput) {
  const parsed = languageSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  const [existing] = await db.select().from(languagesTable).where(eq(languagesTable.code, d.code)).limit(1);
  if (existing) return { ok: false as const, error: "errors.languageExists" };

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.language,
      entityId: d.code,
      summaryKey: "audit.languageCreated",
      summaryParams: { code: d.code, name: d.name },
      requestBody: JSON.stringify({ code: d.code, name: d.name, nativeName: d.nativeName, isDefault: d.isDefault, isEnabled: d.isEnabled, sort: d.sort }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      await tx.insert(languagesTable).values({
        code: d.code, name: d.name, nativeName: d.nativeName,
        isDefault: d.isDefault ?? false, isEnabled: d.isEnabled ?? true, sort: d.sort, createdBy: actor.id,
      });
    },
  );
  invalidateLanguagesCache();
  return { ok: true as const };
}

export async function updateLanguageService(actor: Actor, code: string, input: LanguageUpdateInput) {
  const parsed = languageSchema.omit({ code: true }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "errors.invalidInput" };
  const d = parsed.data;
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.language,
      entityId: code,
      summaryKey: "audit.languageUpdated",
      summaryParams: { code },
      requestBody: JSON.stringify({ code, name: d.name, nativeName: d.nativeName, isDefault: d.isDefault, isEnabled: d.isEnabled, sort: d.sort }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(languagesTable).set({
        name: d.name, nativeName: d.nativeName,
        isDefault: d.isDefault ?? false, isEnabled: d.isEnabled ?? true, sort: d.sort, updatedBy: actor.id,
      }).where(eq(languagesTable.code, code));
    },
  );
  invalidateLanguagesCache();
  return { ok: true as const };
}

export async function toggleLanguageService(actor: Actor, code: string, isEnabled: boolean) {
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.language,
      entityId: code,
      summaryKey: isEnabled ? "audit.languageEnabled" : "audit.languageDisabled",
      summaryParams: { code },
      requestBody: JSON.stringify({ code, isEnabled }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => { await tx.update(languagesTable).set({ isEnabled, updatedBy: actor.id }).where(eq(languagesTable.code, code)); },
  );
  invalidateLanguagesCache();
  return { ok: true as const, error: null };
}

export async function deleteLanguageService(actor: Actor, code: string) {
  const [lang] = await db.select().from(languagesTable).where(eq(languagesTable.code, code)).limit(1);
  if (!lang) return { ok: false as const, error: "errors.languageNotFound" };
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.language,
      entityId: code,
      summaryKey: "audit.languageDeleted",
      summaryParams: { code },
      requestBody: JSON.stringify({ code }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => { await tx.delete(languagesTable).where(eq(languagesTable.code, code)); },
  );
  invalidateLanguagesCache();
  return { ok: true as const };
}

/* ===================== 审计日志清理（供 logs 与桌面定时器共用） ===================== */

/** 批量删除审计日志（管理员；删除动作本身自反留痕）/ Batch delete audit logs */
export async function deleteAuditLogsService(actor: Actor, ids: string[]) {
  if (!ids.length) return { ok: false as const, error: "errors.noLogsSelected" };
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.auditLog,
      summaryKey: "audit.auditLogsBatchDeleted",
      summaryParams: { count: ids.length },
      requestBody: JSON.stringify({ count: ids.length }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => { await tx.delete(auditLogsTable).where(inArray(auditLogsTable.id, ids)); },
  );
  return { ok: true as const, error: null };
}

/** 清理超期日志（按设置保留天数）/ Clear expired logs by retention days */
export async function clearExpiredLogsService(actor: Actor) {
  const days = await resolveRetentionDays();
  const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.auditLog,
      summaryKey: "audit.auditLogsCleared",
      summaryParams: { days },
      requestBody: JSON.stringify({ retentionDays: days }),
      responseBody: '{"result":"cleared"}',
    },
    async (tx) => { await tx.delete(auditLogsTable).where(lte(auditLogsTable.createdAt, cutoff)); },
  );
  return { ok: true as const, error: null };
}
