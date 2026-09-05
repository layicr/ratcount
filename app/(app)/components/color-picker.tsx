"use client";

import { useState, useRef, useEffect } from "react";
import { useT } from "@/components/i18n-provider";

/**
 * 颜色选择器（Color Picker）
 * 点击当前颜色按钮弹出颜色面板，选择后回调 onChange。
 * 用于标签等需要颜色的表单字段。
 */

/** 预设常用颜色列表（40 色）/ Preset common colors (40 colors) */
const COLORS = [
  // 红色系
  "#ef4444", "#f87171", "#fca5a5", "#dc2626",
  // 橙色系
  "#f97316", "#fb923c", "#fdba74", "#ea580c",
  // 黄色系
  "#f59e0b", "#fbbf24", "#fcd34d", "#d97706",
  // 绿色系
  "#22c55e", "#4ade80", "#86efac", "#16a34a",
  // 青色系
  "#14b8a6", "#2dd4bf", "#5eead4", "#0d9488",
  // 蓝色系
  "#3b82f6", "#60a5fa", "#93c5fd", "#2563eb",
  // 靛色系
  "#6366f1", "#818cf8", "#a5b4fc", "#4f46e5",
  // 紫色系
  "#8b5cf6", "#a78bfa", "#c4b5fd", "#7c3aed",
  // 粉色系
  "#ec4899", "#f472b6", "#f9a8d4", "#db2777",
  // 灰色系
  "#64748b", "#94a3b8", "#475569", "#334155",
];

export function ColorPicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (color: string) => void;
  size?: "sm" | "md";
}) {
  const t = useT();
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

  const btnSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${btnSize} flex items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:border-teal-400 hover:bg-teal-50`}
        title={t("common.selectColor")}
      >
        <span className="h-5 w-5 rounded-full border border-slate-300" style={{ background: value || "#0d9488" }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          {/* 自定义颜色输入 / Custom color input */}
          <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <input
              type="color"
              value={value || "#0d9488"}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              title={t("common.customColor")}
            />
            <input
              type="text"
              value={value || "#0d9488"}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
              }}
              placeholder="#0d9488"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono"
              maxLength={7}
            />
          </div>
          {/* 预设颜色网格 / Preset color grid */}
          <div className="grid grid-cols-8 gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => { onChange(color); setOpen(false); }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:scale-110 ${
                  value?.toLowerCase() === color.toLowerCase() ? "ring-2 ring-teal-400 ring-offset-1" : ""
                }`}
                title={color}
              >
                <span className="h-5 w-5 rounded-full border border-slate-300" style={{ background: color }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
