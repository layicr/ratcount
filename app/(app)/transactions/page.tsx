import { accounts, categories } from "@/db/schema"
import { requireUser } from "@/lib/scope"
import { TRANSACTION_TYPES, transactionTypeLabel, TX } from "@/lib/constants"
import { eq } from "drizzle-orm";
import { getCurrentLedger } from "@/lib/ledger";
import { listTransactions, countTransactions } from "@/lib/queries";
import { db } from "@/lib/db";




import { getPaginationConfig, parsePage, resolvePageSize, computeOffset, computeTotalPages, buildPager } from "@/lib/pagination";
import { txListFilterSchema } from "@/lib/validators";
import { TxList } from "./tx-list";
import { ImportButton } from "./import-button";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 流水明细：筛选 + 列表 + 批量删除 + 分页（i18n） */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; categoryId?: string; q?: string; page?: string; accountId?: string; accountIds?: string | string[]; projectId?: string; startDate?: string; endDate?: string; pageSize?: string; minAmount?: string; maxAmount?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const sp = await searchParams;
  // 全部筛选参数白名单/格式预校验（非法值回退为空/不过滤）
  const f = txListFilterSchema.parse(sp);
  const type = f.type;
  const categoryId = f.categoryId ?? "";
  const accountId = f.accountId ?? "";
  // 账户多选（追加条件查询）：与历史单选 accountId 合并去重，作为下拉勾选的回显依据
  const accountIds = [...new Set([...f.accountIds, ...(accountId ? [accountId] : [])])];
  const projectId = f.projectId ?? "";
  const q = f.q ?? "";
  const startDate = f.startDate ?? "";
  const endDate = f.endDate ?? "";
  const minAmount = f.minAmount ?? "";
  const maxAmount = f.maxAmount ?? "";
  const page = parsePage(sp.page);
  // 从全局设置读取分页配置 / Read pagination config from global settings
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();
  const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);
  const d = (await getMessages()) as unknown as AppDict;

  if (!ledger) return <p className="text-slate-500">{d.errors.noLedger}</p>;

  // 金额区间：用户输入元，转换为分（数据库存储单位）
  const minAmountCents = minAmount ? Math.round(parseFloat(minAmount) * 100) : undefined;
  const maxAmountCents = maxAmount ? Math.round(parseFloat(maxAmount) * 100) : undefined;

  const filterOpts = { type: type || undefined, categoryId: categoryId || undefined, q: q || undefined, accountId: accountId || undefined, accountIds, projectId: projectId || undefined, startDate: startDate || undefined, endDate: endDate || undefined, minAmount: minAmountCents, maxAmount: maxAmountCents };
  const [total, txs, cats, accts] = await Promise.all([
    countTransactions(ledger.id, filterOpts),
    listTransactions(ledger.id, { ...filterOpts, limit: pageSize, offset: computeOffset(page, pageSize) }),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)).orderBy(accounts.sort, accounts.name),
  ]);
  const totalPages = computeTotalPages(total, pageSize);

  // 分页链接保留筛选参数（服务端预生成，避免传函数给客户端）
  const qs = (p: number) => `?type=${type}&categoryId=${categoryId}&q=${encodeURIComponent(q)}&accountId=${accountId}${accountIds.map((id) => `&accountIds=${id}`).join("")}&projectId=${projectId}&startDate=${startDate}&endDate=${endDate}&minAmount=${minAmount}&maxAmount=${maxAmount}&pageSize=${pageSize}&page=${p}`;
  const pagination = buildPager({
    page,
    totalPages,
    total,
    pageSize,
    pageSizeOptions: allowedPageSizes,
    href: qs,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">{d.nav.transactions}</h1>
      </div>

      {/* 筛选栏 */}
      <form className="flex flex-wrap items-center gap-2">
        <select name="type" defaultValue={type ?? ""} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
          <option value="">{d.common.all}</option>
          {TRANSACTION_TYPES.map((o) => (
            <option key={o.v} value={o.v}>{transactionTypeLabel(d, o.v)}</option>
          ))}
        </select>
        <select name="categoryId" defaultValue={categoryId} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
          <option value="">{d.tx.allCats}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.type === TX.income ? d.common.income : d.common.expense}-{c.name}</option>
          ))}
        </select>
        {/* 账户多选：追加条件查询，命中任一所选账户（转账则出/入账户任一命中）；原生 checkbox + details，无需客户端 JS */}
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 [&::-webkit-details-marker]:hidden">
            <span>{d.common.account}</span>
            {accountIds.length > 0 && (
              <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-xs font-bold text-teal-600">{accountIds.length}</span>
            )}
            <span className="text-xs text-slate-400">▾</span>
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {accts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="accountIds"
                  value={a.id}
                  defaultChecked={accountIds.includes(a.id)}
                  className="accent-teal-600"
                />
                <span className="truncate">{a.icon} {a.name}</span>
              </label>
            ))}
          </div>
        </details>
        <input type="date" name="startDate" defaultValue={startDate} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <span className="text-slate-400">~</span>
        <input type="date" name="endDate" defaultValue={endDate} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <div className="flex items-center gap-1">
          <input type="number" name="minAmount" defaultValue={minAmount} placeholder={d.tx.minAmount} step="0.01" min="0" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-400">~</span>
          <input type="number" name="maxAmount" defaultValue={maxAmount} placeholder={d.tx.maxAmount} step="0.01" min="0" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <input name="q" defaultValue={q} placeholder={d.tx.searchRemark} className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <button className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700">{d.common.filter}</button>
        <a
          href={`/transactions?pageSize=${pageSize}`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {d.common.clear}
        </a>
        <ImportButton />
      </form>

      <TxList txs={txs} pagination={pagination} />
    </div>
  );
}
