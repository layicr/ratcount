import { desc, eq, or, like, and, sql } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getLocale, getDictionary } from "@/lib/i18n";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/db/schema";
import { getPaginationConfig } from "@/lib/pagination";
import { LogsManager } from "./logs-manager";

/** 操作日志：写操作留痕（C/U/D）+ 分页 + 搜索 + 批量删除 + 清理；按用户维度隔离 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const user = await requireUser();
  const d = getDictionary(await getLocale());
  const ACTION_LABELS: Record<string, string> = { C: d.logs.actionC, R: d.logs.actionR, U: d.logs.actionU, D: d.logs.actionD };

  // 从全局设置读取分页配置
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();

  // Next.js 16: searchParams 是 Promise，必须 await
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();
  // 每页条数：只接受全局设置中允许的值，否则用默认值
  const rawSize = parseInt(sp.pageSize ?? "", 10);
  const pageSize = allowedPageSizes.includes(rawSize) ? rawSize : defaultPageSize;
  const offset = (page - 1) * pageSize;

  // 搜索条件：summary / entity / action / 用户昵称 / 用户邮箱 / 用户编号 模糊匹配
  const searchCond = q
    ? or(
        like(auditLogs.summary, `%${q}%`),
        like(auditLogs.entity, `%${q}%`),
        like(auditLogs.action, `%${q}%`),
        like(users.name, `%${q}%`),
        like(users.email, `%${q}%`),
        like(auditLogs.userId, `%${q}%`),
      )
    : undefined;

  // 管理员查看全部日志；普通用户仅查看自己的日志
  const baseWhere = user.role === "admin"
    ? searchCond
    : searchCond ? and(eq(auditLogs.userId, user.id), searchCond) : eq(auditLogs.userId, user.id);

  // 总数（用于分页）：需要 join users 表，因为搜索条件包含 users.name / users.email
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(baseWhere as any);
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 分页查询
  const rows = await db
    .select({ log: auditLogs, email: users.email, name: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(baseWhere as any)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  const data = rows.map((r) => ({
    id: r.log.id,
    userId: r.log.userId,
    action: r.log.action,
    entity: r.log.entity,
    entityId: r.log.entityId,
    summary: r.log.summary,
    requestBody: (r.log as any).requestBody ?? null,
    responseBody: (r.log as any).responseBody ?? null,
    ip: (r.log as any).ip ?? null,
    email: r.email ?? "-",
    name: r.name ?? "",
    createdAt: r.log.createdAt,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">{d.logs.title}</h1>
        {user.role !== "admin" && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{d.logs.adminOnly}</span>
        )}
      </div>
      <LogsManager
        logs={data}
        isAdmin={user.role === "admin"}
        actionLabels={ACTION_LABELS}
        page={page}
        totalPages={totalPages}
        total={total}
        q={q}
        pageSize={pageSize}
        allowedPageSizes={allowedPageSizes}
      />
    </div>
  );
}
