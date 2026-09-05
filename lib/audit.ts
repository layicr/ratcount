import { db } from "@/lib/db";
import { auditLogs, type AuditAction } from "@/db/schema";
import type { LibSQLTransaction } from "drizzle-orm/libsql";

/**
 * 审计日志（withAudit 包装器）
 *  - 业务写入与审计写入必须在同一事务：业务成功则必有日志，日志失败则业务回滚
 *  - action：C=新增 / U=修改 / D=删除（查询类不再记录日志）
 *  - 按用户维度记录；可携带请求内容 / 响应内容
 */
export type AuditInput = {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
  requestBody?: string | null; // 请求内容（JSON 字符串）
  responseBody?: string | null; // 响应内容（JSON 字符串）
  ip?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 在单事务内执行业务操作并写审计 / Run business op + audit in one transaction */
export async function withAudit<T>(
  input: AuditInput,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    await tx.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      requestBody: input.requestBody ?? null,
      responseBody: input.responseBody ?? null,
      ip: input.ip ?? null,
    });
    return result;
  });
}

/** 单独写一条审计（非事务场景，用于非业务型动作） / Write a standalone audit row */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      requestBody: input.requestBody ?? null,
      responseBody: input.responseBody ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    // 审计写入失败不影响主流程，但必须记录到服务器日志便于排查
    console.error(`[audit] 审计日志写入失败: entity=${input.entity} action=${input.action}`, err);
  }
}

export type { LibSQLTransaction };
