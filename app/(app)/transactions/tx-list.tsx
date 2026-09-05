"use client";

import { useState, useTransition } from "react";
import {
  batchDeleteTransactions,
  copyTransaction,
  deleteTransaction,
} from "@/app/actions/transactions";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton, useToast } from "../components/confirm";
import { TxTypeBadge } from "../components/badges";
import { formatCents } from "@/lib/money";

type Tx = {
  id: string; type: string; amountCents: number; txDate: string;
  remark: string | null; account?: { name: string; icon: string };
  toAccount?: { name: string; icon: string };
  category?: { name: string; icon: string }; project?: { name: string; icon: string };
  tagList: { name: string; color: string }[];
};

/** 流水列表：多选 + 批量删除（确认框）+ 行内复制/删除 + 分页（i18n） */
export function TxList({
  txs,
  pagination,
}: {
  txs: Tx[];
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    pageSizeOptions?: number[];
    prevHref: string;
    nextHref: string;
    pageHrefs: { page: number; href: string }[];
  };
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const t = useT();

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel((prev) => (prev.size === txs.length ? new Set() : new Set(txs.map((x) => x.id))));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* 批量操作栏 */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={sel.size > 0 && sel.size === txs.length} onChange={toggleAll} className="accent-teal-600" />
          {t("tx.selCount", { sel: sel.size, total: txs.length })}
        </label>
        <ConfirmButton
          danger
          disabled={sel.size === 0}
          action={async () => {
            await batchDeleteTransactions([...sel]);
            setSel(new Set());
          }}
          title={t("tx.batchTitle")}
          desc={t("tx.batchDesc", { count: sel.size })}
          okText={t("common.delete")}
        >
          <span className={`rounded-lg px-3 py-1.5 text-xs ${sel.size ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-300"}`}>
            {t("common.batchDelete")}{sel.size ? `（${sel.size}）` : ""}
          </span>
        </ConfirmButton>
      </div>

      {txs.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">{t("tx.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="w-8 px-4 py-2"></th>
                <th className="py-2">{t("tx.type")}</th><th>{t("tx.category")}</th><th>{t("tx.account")}</th><th>{t("tx.project")}</th><th>{t("tx.summary")}</th>
                <th>{t("tx.tag")}</th><th className="text-right">{t("tx.amount")}</th><th className="text-right">{t("tx.date")}</th><th className="text-right">{t("tx.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={sel.has(tx.id)} onChange={() => toggle(tx.id)} className="accent-teal-600" />
                  </td>
                  <td className="py-2"><TxTypeBadge type={tx.type} /></td>
                  <td className="text-slate-600">{tx.category ? `${tx.category.icon} ${tx.category.name}` : "-"}</td>
                  <td className="text-slate-500">
                    {tx.account ? `${tx.account.icon} ${tx.account.name}` : "-"}
                    {tx.toAccount ? ` → ${tx.toAccount.icon} ${tx.toAccount.name}` : ""}
                  </td>
                  <td className="text-slate-500">{tx.project ? `${tx.project.icon} ${tx.project.name}` : "-"}</td>
                  <td className="max-w-[160px] truncate text-slate-600">
                    {tx.remark ?? "-"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {tx.tagList.map((tg) => (
                        <span key={tg.name} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${tg.color}22`, color: tg.color }}>{tg.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className={`text-right font-medium ${tx.type === "income" ? "text-green-600" : tx.type === "expense" ? "text-red-600" : "text-slate-500"}`}>
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}¥ {formatCents(tx.amountCents)}
                  </td>
                  <td className="text-right text-slate-400">{tx.txDate}</td>
                  <td className="text-right"><RowOps tx={tx} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页控件（样式与操作日志一致） */}
      {pagination && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {t("tx.pageInfo", { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
            </span>
            {/* 每页条数选择（select 下拉框，与操作日志一致） */}
            <label className="flex items-center gap-1 text-xs text-slate-400">
              {t("tx.pageSize")}
              <select
                value={pagination.pageSize}
                onChange={(e) => {
                  const size = parseInt(e.target.value, 10);
                  const url = new URL(window.location.href);
                  url.searchParams.set("pageSize", String(size));
                  url.searchParams.set("page", "1");
                  window.location.href = url.toString();
                }}
                className="rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600 outline-none focus:border-teal-500"
              >
                {pagination.pageSizeOptions?.map((s) => (
                  <option key={s} value={s}>{s} {t("tx.itemsPerPage")}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={pagination.prevHref}
              className={`rounded-lg border border-slate-200 px-3 py-1 text-xs ${pagination.page === 1 ? "pointer-events-none opacity-40 text-slate-600" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t("common.prev")}
            </a>
            {pagination.pageHrefs.map(({ page: p, href }) => (
              <a
                key={p}
                href={href}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${p === pagination.page ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {p}
              </a>
            ))}
            <a
              href={pagination.nextHref}
              className={`rounded-lg border border-slate-200 px-3 py-1 text-xs ${pagination.page === pagination.totalPages ? "pointer-events-none opacity-40 text-slate-600" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t("common.next")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function RowOps({ tx }: { tx: Tx }) {
  const t = useT();
  const toast = useToast();
  return (
    <div className="flex items-center justify-end gap-2">
      <a href={`/transactions/${tx.id}/edit`} className="text-xs text-teal-600 hover:underline">
        {t("common.edit")}
      </a>
      <ConfirmButton
        action={async () => {
          const r = await copyTransaction(tx.id);
          if (r.ok) toast(t("tx.copyOk"));
        }}
        title={t("tx.copyTitle")}
        desc={t("tx.copyDesc")}
        okText={t("common.copy")}
      >
        <span className="text-xs text-teal-600 hover:underline">{t("common.copy")}</span>
      </ConfirmButton>
      <ConfirmButton
        danger
        action={async () => { await deleteTransaction(tx.id); }}
        title={t("tx.delTitle")}
        desc={t("tx.delDesc")}
        okText={t("common.delete")}
      >
        <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
      </ConfirmButton>
    </div>
  );
}
