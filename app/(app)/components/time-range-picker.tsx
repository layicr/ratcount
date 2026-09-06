"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT, useLocale } from "@/components/i18n-provider";
import type { StatsPeriod } from "@/lib/queries";

const MONTHS_ZH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 时间选择器：按年 / 按月切换，顶部年份左右切换，弹出网格选择 */
export function TimeRangePicker({ period }: { period: StatsPeriod }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const locale = useLocale();
  const MONTHS = locale === "en" ? MONTHS_EN : MONTHS_ZH;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"year" | "month">(period.type);
  const [decadeStart, setDecadeStart] = useState(Math.floor(period.year / 10) * 10);
  const [pickerYear, setPickerYear] = useState(period.year);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // 点击外部关闭
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function buildUrl(p: StatsPeriod): string {
    const params = new URLSearchParams(searchParams.toString());
    // 保留当前 tab（总览/分类等），仅更新 period
    params.set("period", p.type === "year" ? `year-${p.year}` : `month-${p.year}-${String(p.month ?? 1).padStart(2, "0")}`);
    return `?${params.toString()}`;
  }

  function shiftYear(delta: number) {
    const y = period.year + delta;
    const p = { ...period, year: y };
    router.push(buildUrl(p));
    setPickerYear(y);
    setDecadeStart(Math.floor(y / 10) * 10);
  }

  function pickYear(y: number) {
    router.push(buildUrl({ type: "year", year: y }));
    setOpen(false);
  }

  function pickMonth(m: number) {
    router.push(buildUrl({ type: "month", year: pickerYear, month: m }));
    setOpen(false);
  }

  const years = Array.from({ length: 10 }, (_, i) => decadeStart + i);

  return (
    <div className="relative" ref={ref}>
      {/* 顶部年份切换器 */}
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-1">
        <button
          type="button"
          onClick={() => shiftYear(-1)}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="上一年"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button
          type="button"
          onClick={() => { setMode(period.type); setPickerYear(period.year); setDecadeStart(Math.floor(period.year / 10) * 10); setOpen((v) => !v); }}
          className="min-w-[80px] rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {period.year}{t("common.yearSuffix")}
        </button>
        <button
          type="button"
          onClick={() => shiftYear(1)}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="下一年"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      {/* 弹出面板 */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          {/* 按年 / 按月 tab */}
          <div className="mb-3 flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("year")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${mode === "year" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("common.byYear")}
            </button>
            <button
              type="button"
              onClick={() => setMode("month")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${mode === "month" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("common.byMonth")}
            </button>
          </div>

          {mode === "year" ? (
            <>
              {/* 十年范围切换 */}
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDecadeStart((d) => d - 10)}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                  aria-label="上一个十年"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span className="text-sm font-medium text-slate-700">{decadeStart}-{decadeStart + 9}{t("common.yearSuffix")}</span>
                <button
                  type="button"
                  onClick={() => setDecadeStart((d) => d + 10)}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                  aria-label="下一个十年"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </div>
              {/* 年份网格 */}
              <div className="grid grid-cols-4 gap-1.5">
                {years.map((y) => {
                  const selected = period.type === "year" && period.year === y;
                  const isCurrent = y === curYear;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => pickYear(y)}
                      className={`relative rounded-lg py-2 text-sm transition ${
                        selected
                          ? "border-2 border-orange-400 bg-orange-50 font-semibold text-orange-600"
                          : "border border-transparent text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {y}
                      {isCurrent && !selected && <span className="absolute -right-0.5 -top-0.5 text-[9px] text-slate-400">{t("common.currentYear")}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* 年份切换（按月模式） */}
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                  aria-label="上一年"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span className="text-sm font-medium text-slate-700">{pickerYear}{t("common.yearSuffix")}</span>
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                  aria-label="下一年"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </div>
              {/* 月份网格 */}
              <div className="grid grid-cols-4 gap-1.5">
                {MONTHS.map((label, i) => {
                  const m = i + 1;
                  const selected = period.type === "month" && period.year === pickerYear && period.month === m;
                  const isCurrent = pickerYear === curYear && m === curMonth;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMonth(m)}
                      className={`relative rounded-lg py-2 text-sm transition ${
                        selected
                          ? "border-2 border-orange-400 bg-orange-50 font-semibold text-orange-600"
                          : isCurrent
                            ? "border-2 border-orange-300 bg-orange-50/50 font-medium text-orange-500 hover:bg-orange-50"
                            : "border border-transparent text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
