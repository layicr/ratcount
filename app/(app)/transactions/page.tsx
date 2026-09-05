import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { listTransactions, countTransactions } from "@/lib/queries";
import { db } from "@/lib/db";
import { categories } from "@/db/schema";
import { getLocale, getDictionary } from "@/lib/i18n";
import { getPaginationConfig } from "@/lib/pagination";
import { TxList } from "./tx-list";
import { ImportButton } from "./import-button";

/** 流水明细：筛选 + 列表 + 批量删除 + 分页（i18n） */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; categoryId?: string; q?: string; page?: string; accountId?: string; projectId?: string; startDate?: string; endDate?: string; pageSize?: string; minAmount?: string; maxAmount?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const sp = await searchParams;
  const type = sp.type ?? "";
  const categoryId = sp.categoryId ?? "";
  const q = sp.q ?? "";
  const accountId = sp.accountId ?? "";
  const projectId = sp.projectId ?? "";
  const startDate = sp.startDate ?? "";
  const endDate = sp.endDate ?? "";
  const minAmount = sp.minAmount ?? "";
  const maxAmount = sp.maxAmount ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  // 从全局设置读取分页配置 / Read pagination config from global settings
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();
  const pageSize = allowedPageSizes.includes(parseInt(sp.pageSize ?? "", 10))
    ? parseInt(sp.pageSize!, 10)
    : defaultPageSize;
  const d = getDictionary(await getLocale());

  if (!ledger) return <p className="text-slate-500">{d.common.noLedger}</p>;

  // 金额区间：用户输入元，转换为分（数据库存储单位）
  const minAmountCents = minAmount ? Math.round(parseFloat(minAmount) * 100) : undefined;
  const maxAmountCents = maxAmount ? Math.round(parseFloat(maxAmount) * 100) : undefined;

  const filterOpts = { type: type || undefined, categoryId: categoryId || undefined, q: q || undefined, accountId: accountId || undefined, projectId: projectId || undefined, startDate: startDate || undefined, endDate: endDate || undefined, minAmount: minAmountCents, maxAmount: maxAmountCents };
  const [total, txs] = await Promise.all([
    countTransactions(ledger.id, filterOpts),
    listTransactions(ledger.id, { ...filterOpts, limit: pageSize, offset: (page - 1) * pageSize }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cats = await db.select().from(categories).where(eq(categories.ledgerId, ledger.id));

  // 分页链接保留筛选参数（服务端预生成，避免传函数给客户端）
  const qs = (p: number) => `?type=${type}&categoryId=${categoryId}&q=${encodeURIComponent(q)}&accountId=${accountId}&projectId=${projectId}&startDate=${startDate}&endDate=${endDate}&minAmount=${minAmount}&maxAmount=${maxAmount}&pageSize=${pageSize}&page=${p}`;
  // 预生成当前页附近的页码链接
  const pageStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => pageStart + i).filter((p) => p <= totalPages);
  const pagination = {
    page,
    totalPages,
    total,
    pageSize,
    pageSizeOptions: allowedPageSizes,
    prevHref: qs(Math.max(1, page - 1)),
    nextHref: qs(Math.min(totalPages, page + 1)),
    pageHrefs: pageNumbers.map((p) => ({ page: p, href: qs(p) })),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">{d.nav.transactions}</h1>
        <div className="flex items-center gap-2">
          <ImportButton />
          <a href="/add" className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700">{d.dashboard.addFlow}</a>
        </div>
      </div>

      {/* 筛选栏 */}
      <form className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          {[
            { v: "", l: d.tx.all }, { v: "income", l: d.tx.income }, { v: "expense", l: d.tx.expense }, { v: "transfer", l: d.tx.transfer },
          ].map((t) => (
            <a
              key={t.v}
              href={`/transactions?type=${t.v}&categoryId=${categoryId}&q=${encodeURIComponent(q)}&accountId=${accountId}&projectId=${projectId}&startDate=${startDate}&endDate=${endDate}&minAmount=${minAmount}&maxAmount=${maxAmount}&page=1`}
              className={`px-3 py-1.5 ${type === t.v ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {t.l}
            </a>
          ))}
        </div>
        <select name="categoryId" defaultValue={categoryId} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
          <option value="">{d.tx.allCats}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.type === "income" ? d.tx.income : d.tx.expense}-{c.name}</option>
          ))}
        </select>
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
      </form>

      <TxList txs={txs} pagination={pagination} />
    </div>
  );
}
