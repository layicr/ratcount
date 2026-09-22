"use client";

/** 可复用标签多选：记账页与持仓操作弹窗共用 */
export function TagPicker({
  tags,
  value,
  onChange,
}: {
  tags: { id: string; name: string; color: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tg) => {
        const active = value.includes(tg.id);
        return (
          <button
            type="button"
            key={tg.id}
            onClick={() => onChange(active ? value.filter((x) => x !== tg.id) : [...value, tg.id])}
            className={`rounded-full px-3 py-1 text-xs transition ${active ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            style={active ? { background: tg.color } : undefined}
          >
            {tg.name}
          </button>
        );
      })}
    </div>
  );
}
