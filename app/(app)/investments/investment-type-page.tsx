/**
 * 投资类型页工厂（服务端）
 * 9 个投资类型页（股票/基金/债券/定期/保险/借贷/不动产/数字资产/收藏品）
 * 逻辑完全一致：鉴权 → 取账本 → 分页配置 → 查询 → 取标签 → 生成分页链接 → 渲染表格，
 * 差异仅在 type / variant / 标题 / basePath / newHref 五项，故收口为配置。
 * 贵金属（metals）因黄金/白银子页签与 extraQuery 差异较大，保留独立实现。
 */

import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { listInvestmentsByType, listTags, attachHoldingMeta, listAccountsWithBalance } from "@/lib/queries";
import {
  getPaginationConfig,
  parsePage,
  resolvePageSize,
  computeTotalPages,
  buildPager,
  buildPageHref,
} from "@/lib/pagination";
import { InvestmentTypeTable } from "../components/investment-type-table";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";
import type { InvestmentType } from "@/lib/constants";

/** 表格展示变体（与 InvestmentTypeTable 的 variant 保持一致） */
export type InvestmentVariant = "tradable" | "fixed" | "estate";

export function makeInvestmentTypePage(cfg: {
  type: InvestmentType;
  variant: InvestmentVariant;
  /** 标题取自字典（各页 d.nav.* 不同），以函数传入避免动态 key 丢类型 */
  title: (d: AppDict) => string;
  basePath: string;
  newHref: string;
}) {
  return async function InvestmentTypePage({
    searchParams,
  }: {
    searchParams: Promise<{ q?: string; page?: string; from?: string; to?: string; pageSize?: string }>;
  }) {
    await requireUser();
    const ledger = await requireCurrentLedger();
    const sp = await searchParams;
    const d = (await getMessages()) as unknown as AppDict;
    // 分页配置取自全局设置，与流水明细保持一致
    const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();
    const page = parsePage(sp.page);
    const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);
    const dateFrom = sp.from ?? "";
    const dateTo = sp.to ?? "";

    const { rows, total } = await listInvestmentsByType(ledger.id, cfg.type, {
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
    // 分页链接保留筛选条件
    const href = (p: number) =>
      buildPageHref(cfg.basePath, { q: sp.q, from: dateFrom, to: dateTo, pageSize }, p);
    const pagination = buildPager({
      page,
      totalPages,
      total,
      pageSize,
      pageSizeOptions: allowedPageSizes,
      href,
    });

    return (
      <InvestmentTypeTable
        variant={cfg.variant}
        type={cfg.type}
        title={cfg.title(d)}
        holdings={holdings}
        newHref={cfg.newHref}
        tags={tags}
        accounts={accts.map((a) => ({ id: a.id, name: a.name, icon: a.icon }))}
        total={total}
        page={page}
        pageSize={pageSize}
        q={sp.q ?? ""}
        dateFrom={dateFrom}
        dateTo={dateTo}
        pagination={pagination}
      />
    );
  };
}
