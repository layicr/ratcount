/**
 * 系统管理查询 / Admin queries
 *  - listCurrencies / listLanguages：基础字典
 *  - listAuditLogs：操作日志（分页 + 搜索），管理员查全部，普通用户仅自己
 *  - listMenus：菜单（分页 + 搜索 + 设备过滤）
 */
import { currencies, languages as languagesTable, menus as menusTable, users, auditLogs } from "@/db/schema"
import { type MenuDeviceType, type MenuStatusCode } from "@/lib/constants"



import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db";




/** 币种列表 / Currency list */
export async function listCurrencies() {
  return db.select().from(currencies).orderBy(currencies.sort, currencies.code);
}

/** 语言列表 / Language list */
export async function listLanguages() {
  return db.select().from(languagesTable).orderBy(languagesTable.sort, languagesTable.code);
}

/** 审计日志行（含关联用户昵称/邮箱）/ Audit log row with user info */
export type AuditLogRow = {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  summaryKey: string | null;
  summaryParams: string | null;
  requestBody: string | null;
  responseBody: string | null;
  ip: string | null;
  email: string;
  name: string;
  createdAt: string;
};

/** 审计日志查询（分页 + 搜索）；管理员查全部，普通用户仅自己 / List audit logs */
export async function listAuditLogs(opts: {
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AuditLogRow[]; total: number; totalPages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const q = (opts.search ?? "").trim();
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
  const baseWhere = opts.userId
    ? searchCond
      ? and(eq(auditLogs.userId, opts.userId), searchCond)
      : eq(auditLogs.userId, opts.userId)
    : searchCond;

  const [[countRow], rows] = await Promise.all([
    db
      .select({ count: count() })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(baseWhere),
    db
      .select({ log: auditLogs, email: users.email, name: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(baseWhere)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const data = rows.map((r) => ({
    id: r.log.id,
    userId: r.log.userId,
    action: r.log.action,
    entity: r.log.entity,
    entityId: r.log.entityId,
    summary: r.log.summary,
    summaryKey: r.log.summaryKey,
    summaryParams: r.log.summaryParams,
    requestBody: r.log.requestBody,
    responseBody: r.log.responseBody,
    ip: r.log.ip,
    email: r.email ?? "-",
    name: r.name ?? "",
    createdAt: r.log.createdAt,
  }));
  return { rows: data, total, totalPages };
}

/** 菜单列表（分页 + 搜索 + 设备/状态过滤）；搜索结果匹配 menu_id、icon、link、remark / List menus with pagination & search */
export async function listMenus(opts: {
  search?: string;
  device?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: typeof menusTable.$inferSelect[]; total: number; totalPages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const q = (opts.search ?? "").trim();
  const device = (opts.device ?? "").trim();
  const status = (opts.status ?? "").trim();
  const searchCond = q
    ? or(
        like(menusTable.menuId, `%${q}%`),
        like(menusTable.icon, `%${q}%`),
        like(menusTable.link, `%${q}%`),
        like(menusTable.remark, `%${q}%`),
        // 名称（JSON 字符串，支持中英文模糊）/ name (JSON string, fuzzy match on zh/en)
        like(menusTable.name, `%${q}%`),
        // 设备 / 状态（枚举原值模糊）/ device / status (enum raw value, fuzzy)
        like(menusTable.deviceType, `%${q}%`),
        like(menusTable.statusCode, `%${q}%`),
      )
    : undefined;

  const deviceCond = device ? eq(menusTable.deviceType, device as MenuDeviceType) : undefined;
  const statusCond = status ? eq(menusTable.statusCode, status as MenuStatusCode) : undefined;

  const conds = [searchCond, deviceCond, statusCond].filter(Boolean);
  const baseWhere = conds.length ? and(...conds) : undefined;

  const [countRow] = await db
    .select({ count: count() })
    .from(menusTable)
    .where(baseWhere);
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await db
    .select()
    .from(menusTable)
    .where(baseWhere)
    .orderBy(asc(menusTable.menuGroupId), asc(menusTable.sort))
    .limit(pageSize)
    .offset(offset);

  return { rows, total, totalPages };
}
