export function Card({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`mt-1 text-base font-bold ${tone ?? "text-slate-800"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
