/**
 * 流水查询 / Transaction queries
 *  - listTransactions：列表（含分类/账户/项目/标签，避免 N+1）
 *  - countTransactions：总数（与列表共用同一套过滤条件）
 *  - buildTxConds：过滤条件下推到 SQL，避免全表加载后内存过滤
 */
import { categories, projects, tags, transactionTags, transactions, accounts } from "@/db/schema"
import { type TransactionType } from "@/lib/constants"



import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";




import { inSql } from "@/lib/sql-utils";

/** 流水列表查询参数 / Transaction list options */
export type TxListOpts = {
  type?: string; categoryId?: string; q?: string; accountId?: string; accountIds?: string[]; projectId?: string;
  startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number; limit?: number; offset?: number;
};

/** 构造流水列表/计数的 SQL 过滤条件（两处共用，避免重复）/ Build the SQL WHERE for list/count (shared by both, no duplication) */
export function buildTxConds(ledgerId: string, opts: {
  type?: string; categoryId?: string; q?: string; accountId?: string; accountIds?: string[]; projectId?: string;
  startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number;
}): SQL[] {
  const conds: SQL[] = [eq(transactions.ledgerId, ledgerId)];
  if (opts.type) conds.push(eq(transactions.type, opts.type as TransactionType));
  if (opts.categoryId) conds.push(eq(transactions.categoryId, opts.categoryId));
  if (opts.q) {
    // 关键词搜索：备注 / 项目名 / 标签名；子查询均带 ledgerId 限定，避免跨账本误命中 / Keyword search: remark / project name / tag name; subqueries all bound by ledgerId to avoid cross-ledger hits
    const likePattern = `%${opts.q}%`;
    conds.push(sql`(${transactions.remark} LIKE ${likePattern} OR ${transactions.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${projects.ledgerId} = ${ledgerId} AND ${projects.name} LIKE ${likePattern}) OR ${transactions.id} IN (SELECT ${transactionTags.transactionId} FROM ${transactionTags} WHERE ${transactionTags.tagId} IN (SELECT ${tags.id} FROM ${tags} WHERE ${tags.ledgerId} = ${ledgerId} AND ${tags.name} LIKE ${likePattern})))`);
  }
  // 账户过滤：单选（历史 accountId）与多选（accountIds）合并去重，命中任一即返回（转账则出/入账户任一命中）/ Account filter: merge single (legacy accountId) + multi (accountIds) dedup; match any (transfer: either out/in account)
  const acctFilterIds = [...new Set([...(opts.accountIds ?? []), ...(opts.accountId ? [opts.accountId] : [])])];
  if (acctFilterIds.length) conds.push(sql`(${inArray(transactions.accountId, acctFilterIds)} OR ${inArray(transactions.toAccountId, acctFilterIds)})`);
  if (opts.projectId) conds.push(eq(transactions.projectId, opts.projectId));
  if (opts.startDate) conds.push(sql`${transactions.txDate} >= ${opts.startDate}`);
  if (opts.endDate) conds.push(sql`${transactions.txDate} <= ${opts.endDate}`);
  if (opts.minAmount !== undefined) conds.push(sql`${transactions.amountCents} >= ${opts.minAmount}`);
  if (opts.maxAmount !== undefined) conds.push(sql`${transactions.amountCents} <= ${opts.maxAmount}`);
  return conds;
}

/** 流水列表（含分类/账户/项目/标签）/ Transaction list (with category/account/project/tags) */
export async function listTransactions(
  ledgerId: string,
  opts: TxListOpts = {},
) {
  const conds = buildTxConds(ledgerId, opts);
  const query = db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.txDate), desc(transactions.createdAt))
    .limit(opts.limit ?? 100);
  if (opts.offset) query.offset(opts.offset);
  const rows = await query;
  // 关联数据（用 inSql 工具函数减少重复模板），并行拉取避免 N+1 / Related data via inSql helper (less boilerplate); parallel fetch avoids N+1
  const accountIds = [...new Set(rows.map((r) => [r.accountId, r.toAccountId]).flat().filter(Boolean))] as string[];
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))] as string[];
  const projIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];
  const txIds = rows.map((r) => r.id);
  const [acctMap, catMap, projMap, tagLinks, tagMap] = await Promise.all([
    accountIds.length
      ? db.select().from(accounts).where(inSql(accounts.id, accountIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    catIds.length
      ? db.select().from(categories).where(inSql(categories.id, catIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    projIds.length
      ? db.select().from(projects).where(inSql(projects.id, projIds)).then((r) => new Map(r.map((x) => [x.id, x])))
      : new Map(),
    txIds.length
      ? db
          .select({ transactionId: transactionTags.transactionId, tagId: transactionTags.tagId })
          .from(transactionTags)
          .where(inSql(transactionTags.transactionId, txIds))
      : [],
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.ledgerId, ledgerId))
      .then((r) => new Map(r.map((x) => [x.id, x]))),
  ]);
  return rows.map((r) => ({
    ...r,
    account: acctMap.get(r.accountId),
    toAccount: r.toAccountId ? acctMap.get(r.toAccountId) : undefined,
    category: r.categoryId ? catMap.get(r.categoryId) : undefined,
    project: r.projectId ? projMap.get(r.projectId) : undefined,
    tagList: tagLinks
      .filter((l) => l.transactionId === r.id)
      .map((l) => tagMap.get(l.tagId))
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  }));
}

/** 流水总数（用于分页）/ Transaction count (for pagination) */
export async function countTransactions(
  ledgerId: string,
  opts: Omit<TxListOpts, "limit" | "offset"> = {},
): Promise<number> {
  const conds = buildTxConds(ledgerId, opts);
  const [row] = await db
    .select({ count: count() })
    .from(transactions)
    .where(and(...conds));
  return Number(row?.count ?? 0);
}
