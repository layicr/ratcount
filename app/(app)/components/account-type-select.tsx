"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ACCOUNT_TYPES, TYPE_ICON } from "@/lib/constants";

/**
 * 账户类型选择器（自定义下拉）
 * 原生 <select> 在部分浏览器（Safari）会忽略 <option> 内的 emoji 图标，
 * 此组件用按钮 + 弹出面板渲染，保证图标在所有浏览器稳定显示。
 */
export function AccountTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭面板 / Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = ACCOUNT_TYPES.find((x) => x.v === value) ?? ACCOUNT_TYPES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm transition hover:border-teal-400"
      >
        <span className="text-base">{TYPE_ICON[current.v]}</span>
        <span className="flex-1 text-left">{t(current.key)}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {ACCOUNT_TYPES.map((op) => (
            <button
              type="button"
              key={op.v}
              onClick={() => { onChange(op.v); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-teal-50 ${
                value === op.v ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-700"
              }`}
            >
              <span className="text-base">{TYPE_ICON[op.v]}</span>
              <span>{t(op.key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
