import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema"
import { type AuditAction } from "@/lib/constants"
import { createTranslator } from "next-intl";
import zhCNMessages from "@/messages/zh-CN.json";
import { DEFAULT_LOCALE } from "@/i18n/routing";

import type { LibSQLTransaction } from "drizzle-orm/libsql";

/**
 * 审计日志（withAudit 包装器）
 *  - 业务写入与审计写入必须在同一事务：业务成功则必有日志，日志失败则业务回滚
 *  - action：C=新增 / U=修改 / D=删除（查询类不再记录日志）
 *  - 按用户维度记录；可携带请求内容 / 响应内容
 *  - summary 国际化：优先用 summaryKey + summaryParams（按查看者语言渲染）；
 *    summary 列同时存默认语言(zh-CN)渲染文本，用于搜索与回退
 * Audit logging (withAudit wrapper)
 *  - Business write and audit write must share one transaction: success ⇒ log exists; log failure ⇒ business rolls back
 *  - action: C=create / U=update / D=delete (read actions are no longer logged)
 *  - Logged per user; can carry request body / response body
 *  - summary i18n: prefer summaryKey + summaryParams (rendered in the viewer's language);
 *    the summary column also stores the default-language (zh-CN) rendered text for search and fallback
 */
export type AuditInput = {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  /** 原始摘要文本（兼容 legacy / 种子 / 非 i18n 场景）；与 summaryKey 二选一 / Raw summary text (legacy / seed / non-i18n); alternative to summaryKey */
  summary?: string | null;
  /** i18n 消息键（优先）：展示时按查看者语言翻译 / i18n message key (preferred): translated in the viewer's language on display */
  summaryKey?: string | null;
  /** i18n 参数（JSON 序列化存储）/ i18n params (stored JSON-serialized) */
  summaryParams?: Record<string, unknown> | null;
  requestBody?: string | null; // 请求内容（JSON 字符串）/ request body (JSON string)
  responseBody?: string | null; // 响应内容（JSON 字符串）/ response body (JSON string)
  ip?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 默认语言翻译器（懒加载，渲染 summaryKey 得到可搜索/回退的默认语言文本）/ Default-locale translator (lazy): renders summaryKey into searchable/fallback default-language text */
let defaultTranslator: ((key: string, params?: Record<string, unknown>) => string) | null = null;
function getDefaultTranslator() {
  if (!defaultTranslator) {
    try {
      defaultTranslator = createTranslator({
        locale: DEFAULT_LOCALE,
        messages: zhCNMessages as never,
      }) as (key: string, params?: Record<string, unknown>) => string;
    } catch {
      defaultTranslator = (key: string) => key;
    }
  }
  return defaultTranslator;
}

/** 解析写入存储的 summary / summaryKey / summaryParams / Resolve the stored summary / summaryKey / summaryParams */
export function resolveSummary(input: AuditInput): {
  summary: string | null;
  summaryKey: string | null;
  summaryParams: string | null;
} {
  if (input.summaryKey) {
    const params = input.summaryParams ?? {};
    let text: string;
    try {
      text = getDefaultTranslator()(input.summaryKey, params);
    } catch {
      text = input.summaryKey;
    }
    return {
      summary: text,
      summaryKey: input.summaryKey,
      summaryParams: JSON.stringify(params),
    };
  }
  return { summary: input.summary ?? null, summaryKey: null, summaryParams: null };
}

/** 在单事务内执行业务操作并写审计 / Run the business op and write the audit inside one transaction */
export async function withAudit<T>(
  input: AuditInput,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    const s = resolveSummary(input);
    await tx.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: s.summary,
      summaryKey: s.summaryKey,
      summaryParams: s.summaryParams,
      requestBody: input.requestBody ?? null,
      responseBody: input.responseBody ?? null,
      ip: input.ip ?? null,
    });
    return result;
  });
}

/** 单独写一条审计（非事务场景，用于非业务型动作）/ Write a standalone audit row (non-transactional; for non-business actions) */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const s = resolveSummary(input);
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: s.summary,
      summaryKey: s.summaryKey,
      summaryParams: s.summaryParams,
      requestBody: input.requestBody ?? null,
      responseBody: input.responseBody ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    // 审计写入失败不影响主流程，但必须记录到服务器日志便于排查 / Audit failure must not break the main flow, but must be logged server-side for debugging
    console.error(`[audit] 审计日志写入失败: entity=${input.entity} action=${input.action}`, err);
  }
}

export type { LibSQLTransaction };
