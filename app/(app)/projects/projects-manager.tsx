"use client";

import { useState } from "react";
import { createProject, updateProject, deleteProject } from "@/app/actions/meta";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../components/confirm";
import { IconPicker } from "../components/icon-picker";
import { formatCents } from "@/lib/money";

type Proj = {
  id: string; name: string; icon: string; status: string; remark: string | null;
  income: number; expense: number; balance: number; budgetCents: number;
};

/** 项目：卡片 + 新增/编辑表单（独立显示） + 删除确认（i18n） */
export function ProjectsManager({ projects }: { projects: Proj[] }) {
  const t = useT();
  const [form, setForm] = useState({ name: "", icon: "📁", budgetYuan: "", status: "active", remark: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", icon: "📁", budgetYuan: "", status: "active", remark: "" });
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const r = await createProject({ ...form, budgetYuan: form.budgetYuan || undefined });
    if (r.ok) {
      setForm({ name: "", icon: "📁", budgetYuan: "", status: "active", remark: "" });
      setCreating(false);
    } else setErr(r.error);
  }

  function startEdit(p: Proj) {
    setEditingId(p.id);
    setEditForm({
      name: p.name, icon: p.icon,
      budgetYuan: p.budgetCents ? (p.budgetCents / 100).toString() : "",
      status: p.status, remark: p.remark ?? "",
    });
    setErr(null);
  }

  async function doEdit() {
    if (!editingId) return;
    setErr(null);
    const r = await updateProject(editingId, { ...editForm, budgetYuan: editForm.budgetYuan || undefined });
    if (r.ok) setEditingId(null);
    else setErr(r.error);
  }

  /** 保存前校验（替代原生 required，支持 i18n） */
  function validateCreate(): boolean {
    if (!form.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }
  function validateEdit(): boolean {
    if (!editForm.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* 新增按钮（居左，点击后出现表单） */}
      {!creating && !editingId && (
        <button onClick={() => { setCreating(true); setErr(null); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
          {t("projects.add")}
        </button>
      )}

      {/* 新增项目表单（独立显示，含备注字段） */}
      {creating && (
        <div className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5">
          <h2 className="text-sm font-bold">{t("projects.add")}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} size="sm" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("projects.name")} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            <input value={form.budgetYuan} onChange={(e) => setForm({ ...form, budgetYuan: e.target.value })} placeholder={t("projects.budget")} inputMode="decimal" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="active">{t("projects.active")}</option><option value="completed">{t("projects.completed")}</option>
            </select>
          </div>
          <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder={t("tags.remarkPlaceholder")} maxLength={200} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
          <div className="flex gap-2">
            <ConfirmButton
              action={submit}
              beforeOpen={validateCreate}
              title={t("projects.saveTitle")}
              desc={t("projects.saveDesc", { name: form.name || t("projects.newProject") })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={() => { setCreating(false); setErr(null); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600">{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* 编辑项目表单（独立显示，不在卡片内） */}
      {editingId && (
        <div className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5">
          <h2 className="text-sm font-bold">{t("common.edit")}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <IconPicker value={editForm.icon} onChange={(icon) => setEditForm({ ...editForm, icon })} size="sm" />
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder={t("projects.name")} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            <input value={editForm.budgetYuan} onChange={(e) => setEditForm({ ...editForm, budgetYuan: e.target.value })} placeholder={t("projects.budget")} inputMode="decimal" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="active">{t("projects.active")}</option><option value="completed">{t("projects.completed")}</option>
            </select>
          </div>
          <input value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} placeholder={t("tags.remarkPlaceholder")} maxLength={200} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
          <div className="flex gap-2">
            <ConfirmButton
              action={doEdit}
              beforeOpen={validateEdit}
              title={t("projects.saveEditTitle")}
              desc={t("projects.saveEditDesc", { name: editForm.name })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={() => { setEditingId(null); setErr(null); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600">{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* 项目卡片列表 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 && <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>}
        {projects.map((p) => {
          const pct = p.budgetCents ? Math.round((p.expense / p.budgetCents) * 100) : 0;
          return (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                    <div className="text-[11px] text-slate-400">{p.status === "active" ? t("projects.active") : t("projects.completed")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/transactions?projectId=${p.id}`} className="text-xs text-teal-600 hover:underline">{t("common.viewTx")}</a>
                  <button type="button" onClick={() => startEdit(p)} className="text-xs text-slate-500 hover:text-teal-600 hover:underline">{t("common.edit")}</button>
                  <ConfirmButton
                    danger
                    action={async () => { await deleteProject(p.id); }}
                    title={t("projects.delTitle")}
                    desc={t("projects.delDesc", { name: p.name })}
                    okText={t("common.delete")}
                  >
                    <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
                  </ConfirmButton>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><div className="text-green-600">+¥{formatCents(p.income)}</div><div className="text-slate-400">{t("reports.income")}</div></div>
                <div><div className="text-red-600">-¥{formatCents(p.expense)}</div><div className="text-slate-400">{t("reports.expense")}</div></div>
                <div><div className={p.balance >= 0 ? "font-semibold" : "font-semibold text-red-600"}>¥{formatCents(p.balance)}</div><div className="text-slate-400">{t("reports.balance")}</div></div>
              </div>
              {p.budgetCents > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>{t("projects.budgetPrefix", { amount: formatCents(p.budgetCents) })}</span><span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-teal-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              )}
              {p.remark && (
                <p className="mt-2 text-xs text-slate-400">{p.remark}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
