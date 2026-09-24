"use client";

import { useState, useTransition } from "react";
import {
  batchDeleteTransactions,
  copyTransaction,
  deleteTransaction,
} from "@/app/actions/transactions";
import { useTranslations } from "next-intl";
import { useBaseCurrency } from "@/components/currency-context";
import { useLocale } from "next-intl";
import { formatCurrency } from "@/lib/money";
import { ConfirmButton, useToast } from "../components/confirm";
import { TxTypeBadge } from "../components/badges";
import { TX } from "@/lib/constants";
import { Pagination } from "../components/pagination";

type Tx = {
  id: string; type: string; amountCents: number; txDate: string;
  currencyCode?: string;
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
  const t = useTranslations();
  const baseCur = useBaseCurrency();
  const locale = useLocale();
  // 原币金额按各自币种符号展示（转账目标额若跨币种则另算）/ native amount uses its own currency symbol
  const txMoney = (tx: Tx) => formatCurrency(tx.amountCents, tx.currencyCode ?? baseCur, locale);

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
          title={t("common.batchDelete")}
          desc={t("tx.batchDesc", { count: sel.size })}
          okText={t("common.delete")}
        >
          <span className={`rounded-lg px-3 py-1.5 text-xs ${sel.size ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-300"}`}>
            {t("common.batchDelete")}{sel.size ? `（${sel.size}）` : ""}
          </span>
        </ConfirmButton>
      </div>

      {txs.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="w-8 px-4 py-2"></th>
                <th className="py-2">{t("common.type")}</th><th>{t("tx.category")}</th><th>{t("common.account")}</th><th>{t("common.project")}</th><th>{t("tx.summary")}</th>
                <th>{t("tx.tag")}</th><th className="text-right">{t("common.amount")}</th><th className="text-right">{t("common.date")}</th><th className="text-right">{t("common.actions")}</th>
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
                  <td className={`text-right font-medium ${tx.type === TX.income ? "text-green-600" : tx.type === TX.expense ? "text-red-600" : "text-slate-500"}`}>
                    {tx.type === TX.income ? "+" : tx.type === TX.expense ? "-" : ""}{txMoney(tx)}
                  </td>
                  <td className="text-right text-slate-400">{tx.txDate}</td>
                  <td className="text-right"><RowOps tx={tx} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页控件（全局共用，链接由页面服务端预生成） */}
      {pagination && <Pagination link={pagination} />}
    </div>
  );
}

function RowOps({ tx }: { tx: Tx }) {
  const t = useTranslations();
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
