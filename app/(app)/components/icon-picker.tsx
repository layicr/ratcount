"use client";

import { useState, useRef, useEffect } from "react";
import { useT } from "@/components/i18n-provider";

/**
 * 图标选择器（Icon Picker）
 * 点击当前图标按钮弹出 emoji 面板，选择后回调 onChange。
 * 用于账本/账户/分类/项目等需要图标的表单字段。
 */

/** 预设常用 emoji 图标列表 / Preset common emoji icons */
const ICONS = [
  // 账本/财务类
  "📒", "📊", "📋", "💰", "💳", "🏦", "💵", "🪙",
  // 生活类
  "🏠", "🍔", "☕", "🛒", "🚗", "✈️", "🎬", "📚",
  // 家庭/个人
  "👶", "👨", "👩", "👪", "🐱", "🐶", "🌳", "🌸",
  // 生意/工作
  "🧋", "🏢", "💼", "📈", "📉", "🎯", "🏆", "⭐",
  // 其他
  "🔥", "🌈", "☀️", "🌙", "❄️", "🍀", "🎁", "🎵",
  "⚽", "🏀", "🎮", "🔑", "💡", "🛠️", "🧰", "📦",
];

export function IconPicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (icon: string) => void;
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

  const btnSize = size === "sm" ? "h-8 w-8 text-base" : "h-10 w-10 text-xl";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${btnSize} flex items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:border-teal-400 hover:bg-teal-50`}
        title={t("common.selectIcon")}
      >
        {value || "❓"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="grid grid-cols-8 gap-1">
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => { onChange(icon); setOpen(false); }}
                className={`flex h-7 w-7 items-center justify-center rounded text-base transition hover:bg-teal-100 ${
                  value === icon ? "bg-teal-100 ring-1 ring-teal-400" : ""
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
