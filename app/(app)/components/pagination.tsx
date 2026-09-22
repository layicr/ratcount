"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { buildPageWindow } from "@/lib/pagination-util";

export type PagerHref = { page: number; href: string };

export type PaginationObject = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  prevHref: string;
  nextHref: string;
  pageHrefs: PagerHref[];
};

type PaginationProps = {
  link?: PaginationObject;
  page?: number;
  totalPages?: number;
  total?: number;
  pageSize?: number;
  basePath?: string;
  q?: string;
  device?: string;
  status?: string;
  onNavigate?: (href: string) => void;
  allowedPageSizes?: number[];
  showInfo?: boolean;
  unit?: string;
};

export function Pagination(props: PaginationProps) {
  const t = useTranslations();
  const unit = props.unit ?? t("common.items");

  const page = props.link ? props.link.page : props.page ?? 1;
  const totalPages = props.link ? props.link.totalPages : props.totalPages ?? 1;
  const total = props.link ? props.link.total : props.total ?? 0;
  const pageSize = props.link ? props.link.pageSize : props.pageSize ?? 10;
  const allowedPageSizes = props.allowedPageSizes ?? [10, 20, 50, 100];

  if (total <= 0) return null;

  const navigate = (href: string) => {
    if (props.onNavigate) props.onNavigate(href);
    else window.location.href = href;
  };

  const buildHref = (p: number, size: number) => {
    const params = new URLSearchParams();
    if (props.q) params.set("q", props.q);
    if (props.device) params.set("device", props.device);
    if (props.status) params.set("status", props.status);
    params.set("page", String(p));
    params.set("pageSize", String(size));
    return `${props.basePath}?${params.toString()}`;
  };

  const pageBtnClass = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-lg text-xs ${
      active ? "bg-teal-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;

  const arrowClass = (disabled: boolean) =>
    `rounded-lg border border-slate-200 px-3 py-1 text-xs ${
      disabled ? "pointer-events-none opacity-40 text-slate-600" : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
      <div className="flex items-center gap-3">
        {props.showInfo !== false && (
          <span className="text-xs text-slate-400">
            {t("common.pager.pageInfo", { page, totalPages, total, unit })}
          </span>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-400">
          {t("common.pager.perPage")}
          <select
            value={pageSize}
            onChange={(e) => {
              const size = parseInt(e.target.value, 10);
              if (props.link) {
                const url = new URL(window.location.href);
                url.searchParams.set("pageSize", String(size));
                url.searchParams.set("page", "1");
                navigate(url.toString());
              } else {
                navigate(buildHref(1, size));
              }
            }}
            className="rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600 outline-none focus:border-teal-500"
          >
            {allowedPageSizes.map((s) => (
              <option key={s} value={s}>{t("common.pager.pageSize", { size: s })}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        {props.link ? (
          <>
            <Link href={props.link.prevHref} className={arrowClass(page <= 1)} aria-disabled={page <= 1}>
              {t("common.pager.prevPage")}
            </Link>
            {props.link.pageHrefs.map(({ page: p, href }) => (
              <Link key={p} href={href} className={pageBtnClass(p === page)}>
                {p}
              </Link>
            ))}
            <Link href={props.link.nextHref} className={arrowClass(page >= totalPages)} aria-disabled={page >= totalPages}>
              {t("common.pager.nextPage")}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate(buildHref(page - 1, pageSize))}
              disabled={page <= 1}
              className={arrowClass(page <= 1)}
            >
              {t("common.pager.prevPage")}
            </button>
            {buildPageWindow(page, totalPages).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => navigate(buildHref(p, pageSize))}
                className={pageBtnClass(p === page)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => navigate(buildHref(page + 1, pageSize))}
              disabled={page >= totalPages}
              className={arrowClass(page >= totalPages)}
            >
              {t("common.pager.nextPage")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
