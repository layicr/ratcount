import { requireUser } from "@/lib/scope"
import { INV } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { listInvestmentsByType, listTags, attachHoldingMeta, listAccountsWithBalance } from "@/lib/queries";
import { getPaginationConfig, parsePage, resolvePageSize, computeTotalPages, buildPager, buildPageHref } from "@/lib/pagination";
import { InvestmentTypeTable } from "../../components/investment-type-table";
import { MetalSubTabs } from "../../components/investment-list-client";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 贵金属管理：黄金 / 白银页签（?sub=gold|silver），克数×100 存储 */
export default async function MetalsPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string; q?: string; page?: string; from?: string; to?: string; pageSize?: string }>;
}) {
  await requireUser();
  const ledger = await requireCurrentLedger();
  const sp = await searchParams;
  const sub = sp.sub === "silver" ? "silver" : "gold";
  const d = (await getMessages()) as unknown as AppDict;
  // 分页配置取自全局设置，与流水明细保持一致
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();
  const page = parsePage(sp.page);
  const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);
  const dateFrom = sp.from ?? "";
  const dateTo = sp.to ?? "";

  // 分别查询黄金/白银数量（用于页签计数，不受日期区间影响）
  const [goldRes, silverRes] = await Promise.all([
    listInvestmentsByType(ledger.id, INV.metal, { subType: "gold", pageSize: 1, page: 1 }),
    listInvestmentsByType(ledger.id, INV.metal, { subType: "silver", pageSize: 1, page: 1 }),
  ]);
  const counts = { gold: goldRes.total, silver: silverRes.total };

  const { rows, total } = await listInvestmentsByType(ledger.id, INV.metal, {
    subType: sub,
    q: sp.q,
    page,
    pageSize,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const totalPages = computeTotalPages(total, pageSize);
  // 标签（动作弹窗用）+ 持仓行附带标签/项目（列表展示用）+ 收款账户候选 并行取
  const [tags, holdings, accts] = await Promise.all([
    listTags(ledger.id),
    attachHoldingMeta(ledger.id, rows),
    listAccountsWithBalance(ledger.id),
  ]);
  // 分页链接保留子类型页签（sub）与筛选条件
  const href = (p: number) =>
    buildPageHref("/investments/metals", { sub, q: sp.q, from: dateFrom, to: dateTo, pageSize }, p);
  const pagination = buildPager({
    page,
    totalPages,
    total,
    pageSize,
    pageSizeOptions: allowedPageSizes,
    href,
  });

  return (
    <div className="space-y-4">
      <MetalSubTabs counts={counts} />
      <InvestmentTypeTable
        variant="metal"
        type={INV.metal}
        title={d.nav.investMetals}
        holdings={holdings}
        newHref={`/investments/new?type=metal&sub=${sub}`}
        tags={tags}
        accounts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon }))}
        total={total}
        page={page}
        pageSize={pageSize}
        q={sp.q ?? ""}
        extraQuery={`sub=${sub}`}
        dateFrom={dateFrom}
        dateTo={dateTo}
        pagination={pagination}
      />
    </div>
  );
}
