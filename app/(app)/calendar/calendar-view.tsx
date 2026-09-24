"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useMoney, useBaseCurrency } from "@/components/currency-context";
import { formatCurrency } from "@/lib/money";
import { TxTypeBadge } from "../components/badges";
import { getWeekdayShortNames } from "@/lib/datetime";
import { TX } from "@/lib/constants";

type Tx = {
  id: string; txDate: string; type: string; amountCents: number; currencyCode?: string;
  account: string; toAccount?: string; category?: string; remark: string | null;
};

/** 收支日历：月历网格 + 每日收支 + 选中日流水明细 */
export function CalendarView({ month, txs, today }: { month: string; txs: Tx[]; today: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const money = useMoney();
  const baseCur = useBaseCurrency();
  const txMoney = (tx: Tx) => formatCurrency(tx.amountCents, tx.currencyCode ?? baseCur, locale);
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(null);
  // 星期表头（周一为一周起点），随 locale 自动变化
  const heads = getWeekdayShortNames(locale);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=周日
  // 周一为一周起点：周日=6
  const offset = (firstDow + 6) % 7;

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; list: Tx[] }>();
    for (const tx of txs) {
      const key = tx.txDate; // 完整日期 YYYY-MM-DD 作为 key
      const cur = map.get(key) ?? { income: 0, expense: 0, list: [] };
      if (tx.type === TX.income) cur.income += tx.amountCents;
      else if (tx.type === TX.expense) cur.expense += tx.amountCents;
      cur.list.push(tx);
      map.set(key, cur);
    }
    return map;
  }, [txs]);

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prevMonth() {
    const p = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return `/calendar?month=${p}`;
  }
  function nextMonth() {
    const n = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return `/calendar?month=${n}`;
  }

  const selDay = sel ? byDay.get(sel) : undefined;
  const totalIn = [...byDay.values()].reduce((s, v) => s + v.income, 0);
  const totalOut = [...byDay.values()].reduce((s, v) => s + v.expense, 0);

  return (
    <div className="space-y-4">
      {/* 月份切换 + 汇总 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={prevMonth()} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">‹</Link>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) router.push(`/calendar?month=${e.target.value}`);
            }}
            className="min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-base font-bold text-slate-800 focus:border-teal-500 focus:outline-none"
          />
          <Link href={nextMonth()} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">›</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-600">+ {money(totalIn)}</span>
          <span className="text-red-600">- {money(totalOut)}</span>
        </div>
      </div>

      {/* 日历网格 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
          {heads.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (day == null) return <div key={di} className="min-h-[64px] rounded-lg bg-slate-50/60" />;
              const key = `${month}-${String(day).padStart(2, "0")}`;
              const info = byDay.get(key);
              const isToday = key === today;
              const isSel = sel === key;
              return (
                <button
                  key={di}
                  onClick={() => setSel(isSel ? null : key)}
                  className={`flex min-h-[64px] flex-col items-start gap-0.5 rounded-lg border p-1.5 text-left transition ${
                    isSel
                      ? "border-teal-500 bg-teal-50"
                      : isToday
                        ? "border-teal-300 bg-white"
                        : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`text-[11px] ${isToday ? "font-bold text-teal-600" : "text-slate-400"}`}>{day}</span>
                  {info?.income ? <span className="text-[10px] font-medium text-green-600">+{money(info.income)}</span> : null}
                  {info?.expense ? <span className="text-[10px] font-medium text-red-500">-{money(info.expense)}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 选中日明细 */}
      {selDay ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-800">
            {sel} · {t("calendar.daily")}
          </h2>
          {selDay.list.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{t("common.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {selDay.list.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <TxTypeBadge type={tx.type} />
                    <span className="text-sm text-slate-600">{tx.remark ?? tx.category ?? "-"}</span>
                    <span className="text-xs text-slate-400">{tx.account}{tx.toAccount ? ` → ${tx.toAccount}` : ""}</span>
                  </div>
                  <span className={`text-sm font-medium ${tx.type === TX.income ? "text-green-600" : tx.type === TX.expense ? "text-red-600" : "text-slate-500"}`}>
                    {tx.type === TX.income ? "+" : tx.type === TX.expense ? "-" : ""}{txMoney(tx)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
