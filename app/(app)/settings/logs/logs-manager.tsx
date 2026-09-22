"use client";

import { Fragment, useState } from "react";
import { deleteAuditLogs, clearExpiredLogs } from "@/app/actions/logs";
import { useTranslations } from "next-intl";
import { ConfirmButton, DeleteButton } from "../../components/confirm";
import { Pagination } from "../../components/pagination";
import { SETTINGS_LOGS_PATH } from "@/lib/constants";

type Log = {
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

const ACTION_CLS: Record<string, string> = {
  C: "bg-green-50 text-green-700",
  R: "bg-slate-100 text-slate-600",
  U: "bg-amber-50 text-amber-700",
  D: "bg-red-50 text-red-600",
};

/** 截断长文本（用于表格内显示）/ Truncate long text for table display */
function truncate(s: string | null, max: number): string {
  if (!s) return "-";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** 审计摘要渲染：优先 summaryKey 按当前语言翻译，缺失时回退 summary 文本 */
function renderAuditSummary(
  t: (key: string, values?: Record<string, string | number>) => string,
  l: Log,
): string {
  if (l.summaryKey) {
    try {
      return t(l.summaryKey, (l.summaryParams ? JSON.parse(l.summaryParams) : {}) as Record<string, string | number>);
    } catch {
      return l.summary ?? l.summaryKey;
    }
  }
  return l.summary ?? "-";
}

/** 日志列表：全部字段显示 + 搜索 + 分页（可选每页条数） + 多选 + 批量删除 + 清理超期（均确认框） */
export function LogsManager({
  logs, isAdmin, actionLabels, page, totalPages, total, q, pageSize, basePath = SETTINGS_LOGS_PATH, allowedPageSizes = [10, 20, 50, 100],
}: {
  logs: Log[];
  isAdmin: boolean;
  actionLabels: Record<string, string>;
  page: number;
  totalPages: number;
  total: number;
  q: string;
  pageSize: number;
  basePath?: string;
  allowedPageSizes?: number[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const t = useTranslations();

  function doSearch() {
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    params.set("page", "1");
    params.set("pageSize", String(pageSize));
    window.location.href = `${basePath}?${params.toString()}`;
  }

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel((prev) => (prev.size === logs.length ? new Set() : new Set(logs.map((l) => l.id))));
  }

  // 总列数（含复选框）/ Total columns including checkbox
  const totalCols = isAdmin ? 14 : 13;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* 搜索框 / Search bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          placeholder={t("logs.searchPlaceholder")}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500"
        />
        <button
          onClick={doSearch}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm text-white hover:bg-teal-700"
        >
          {t("common.filter")}
        </button>
        <button
          onClick={() => {
            setSearchInput("");
            const params = new URLSearchParams();
            params.set("page", "1");
            params.set("pageSize", String(pageSize));
            window.location.href = `${basePath}?${params.toString()}`;
          }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
        >
          {t("common.clear")}
        </button>
      </div>
      {/* 批量操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={sel.size > 0 && sel.size === logs.length} onChange={toggleAll} className="accent-teal-600" />
          {t("logs.selectAll", { sel: sel.size, total: logs.length })}
        </label>
        {isAdmin && (
          <div className="flex gap-2">
            <ConfirmButton
              action={async () => { await clearExpiredLogs(); }}
              title={t("logs.clearTitle")}
              desc={t("logs.clearDesc")}
              okText={t("logs.clearExpired")}
            >
              <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">{t("logs.clearExpired")}</span>
            </ConfirmButton>
            <DeleteButton
              disabled={sel.size === 0}
              action={async () => { await deleteAuditLogs([...sel]); setSel(new Set()); }}
              title={t("logs.delTitle")}
              desc={t("logs.delDesc", { count: sel.size })}
              okText={t("common.delete")}
              label={<span className={`rounded-lg px-3 py-1.5 text-xs ${sel.size ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-300"}`}>
                {t("common.batchDelete")}{sel.size ? `（${sel.size}）` : ""}
              </span>}
            />
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                {isAdmin && <th className="w-8 px-4 py-2"></th>}
                <th className="py-2 pr-2">{t("logs.id")}</th>
                <th className="pr-2">{t("common.actions")}</th>
                <th className="pr-2">{t("logs.entity")}</th>
                <th className="pr-2">{t("logs.entityId")}</th>
                <th className="pr-2">{t("logs.content")}</th>
                <th className="pr-2">{t("common.nickname")}</th>
                <th className="pr-2">{t("logs.userId")}</th>
                <th className="pr-2">{t("logs.userEmail")}</th>
                <th className="pr-2">{t("logs.ip")}</th>
                <th className="pr-2">{t("logs.requestBody")}</th>
                <th className="pr-2">{t("logs.responseBody")}</th>
                <th className="text-right">{t("logs.time")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <Fragment key={l.id}>
                <tr className="border-b border-slate-50 align-top">
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} className="accent-teal-600" />
                    </td>
                  )}
                  <td className="py-2 pr-2 font-mono text-[11px] text-slate-400" title={l.id}>{l.id.slice(0, 8)}</td>
                  <td className="py-2 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_CLS[l.action] ?? "bg-slate-100"}`}>
                      {actionLabels[l.action] ?? l.action}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-slate-500">{l.entity}</td>
                  <td className="py-2 pr-2 font-mono text-[11px] text-slate-400" title={l.entityId ?? "-"}>{l.entityId ? l.entityId.slice(0, 8) : "-"}</td>
                  <td className="py-2 pr-2 max-w-[200px] truncate text-slate-600" title={renderAuditSummary(t, l)}>{renderAuditSummary(t, l)}</td>
                  <td className="py-2 pr-2 text-slate-600">{l.name || "-"}</td>
                  <td className="py-2 pr-2 font-mono text-[11px] text-slate-400" title={l.userId}>{l.userId.slice(0, 8)}</td>
                  <td className="py-2 pr-2 text-slate-500">{l.email || "-"}</td>
                  <td className="py-2 pr-2 font-mono text-[11px] text-slate-400">{l.ip ?? "-"}</td>
                  <td className="py-2 pr-2 max-w-[160px] truncate font-mono text-[11px] text-slate-500" title={l.requestBody ?? "-"}>{truncate(l.requestBody, 24)}</td>
                  <td className="py-2 pr-2 max-w-[160px] truncate font-mono text-[11px] text-slate-500" title={l.responseBody ?? "-"}>{truncate(l.responseBody, 24)}</td>
                  <td className="py-2 text-right text-xs text-slate-400 whitespace-nowrap">{l.createdAt.replace("T", " ").slice(0, 19)}</td>
                </tr>
                {(l.requestBody || l.responseBody) && (
                  <tr key={l.id + "-detail"} className="border-b border-slate-50 bg-slate-50/50">
                    <td colSpan={totalCols} className="px-4 py-2">
                      <button type="button" onClick={() => setOpenId(openId === l.id ? null : l.id)} className="text-xs text-teal-600 hover:underline">
                        {openId === l.id ? t("logs.collapse") : t("logs.viewBody")}
                      </button>
                      {openId === l.id && (
                        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                          {l.requestBody && (
                            <div className="rounded-lg border border-slate-200 bg-white p-2">
                              <div className="mb-1 font-semibold text-slate-500">{t("logs.requestBody")}</div>
                              <pre className="whitespace-pre-wrap break-all text-slate-600">{l.requestBody}</pre>
                            </div>
                          )}
                          {l.responseBody && (
                            <div className="rounded-lg border border-slate-200 bg-white p-2">
                              <div className="mb-1 font-semibold text-slate-500">{t("logs.responseBody")}</div>
                              <pre className="whitespace-pre-wrap break-all text-slate-600">{l.responseBody}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* 分页控件（与菜单管理列表共用） */}
      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          q={q}
          pageSize={pageSize}
          basePath={basePath}
          allowedPageSizes={allowedPageSizes}
        />
      )}
    </div>
  );
}
