"use client";

import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "@/app/actions/categories";
import { useTranslations } from "next-intl";
import { ConfirmButton, DeleteButton } from "../components/confirm";
import { NameRemarkForm } from "../components/name-remark-form";
import { IconPicker } from "../components/icon-picker";
import { TX, type CategoryType } from "@/lib/constants";

type Cat = { id: string; name: string; icon: string; type: string; remark: string | null };

/** 分类管理（收入 / 支出），独立页面 /categories — 卡片列表形式，支持编辑/备注 */
export function CategoriesManager({ cats }: { cats: Cat[] }) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<CategoryType>(TX.expense);
  const [catForm, setCatForm] = useState({ name: "", icon: "📦", type: TX.expense as CategoryType, remark: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", icon: "📦", type: TX.expense as CategoryType, remark: "" });
  const [err, setErr] = useState<string | null>(null);

  const filteredCats = cats.filter((c) => c.type === activeTab);

  function switchTab(tab: CategoryType) {
    setActiveTab(tab);
    setCreating(false);
    setEditingId(null);
    setErr(null);
    setCatForm((f) => ({ ...f, type: tab }));
  }

  async function doCreate() {
    setErr(null);
    const r = await createCategory(catForm);
    if (r.ok) { setCatForm({ name: "", icon: "📦", type: TX.expense, remark: "" }); setCreating(false); }
    else setErr(r.error);
  }

  function validateCreate(): boolean {
    if (!catForm.name.trim()) { setErr("common.nameRequired"); return false; }
    return true;
  }

  function startEdit(c: Cat) {
    setEditingId(c.id);
    setEditForm({ name: c.name, icon: c.icon, type: (c.type as CategoryType), remark: c.remark ?? "" });
    setErr(null);
  }

  async function doEdit() {
    if (!editingId) return;
    setErr(null);
    const r = await updateCategory(editingId, editForm);
    if (r.ok) setEditingId(null);
    else setErr(r.error);
  }

  function validateEdit(): boolean {
    if (!editForm.name.trim()) { setErr("common.nameRequired"); return false; }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* Tab 切换 + 新增按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchTab(TX.expense)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${activeTab === TX.expense ? "bg-white text-teal-700 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("categories.expenseCat")}
          </button>
          <button
            type="button"
            onClick={() => switchTab(TX.income)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${activeTab === TX.income ? "bg-white text-teal-700 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("categories.incomeCat")}
          </button>
        </div>
        {!creating && !editingId && (
          <button onClick={() => { setCreating(true); setErr(null); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {t("common.add")}
          </button>
        )}
      </div>

      {/* 新增分类表单 */}
      {creating && (
        <NameRemarkForm
          picker={<IconPicker value={catForm.icon} onChange={(icon) => setCatForm({ ...catForm, icon })} size="sm" />}
          name={catForm.name}
          nameLabel={t("common.name")}
          iconLabel={t("common.icon")}
          remark={catForm.remark}
          remarkLabel={t("common.remark")}
          onChange={(p) => setCatForm({ ...catForm, ...p })}
          namePlaceholder={t("categories.newCat")}
          action={doCreate}
          beforeOpen={validateCreate}
          title={t("categories.saveCatTitle")}
          desc={t("common.createDesc")}
          okText={t("common.save")}
          onCancel={() => { setCreating(false); setErr(null); }}
          err={err}
        />
      )}

      {/* 编辑分类表单（独立显示，不在卡片内） */}
      {editingId && (
        <NameRemarkForm
          picker={<IconPicker value={editForm.icon} onChange={(icon) => setEditForm({ ...editForm, icon })} size="sm" />}
          name={editForm.name}
          nameLabel={t("common.name")}
          iconLabel={t("common.icon")}
          remark={editForm.remark}
          remarkLabel={t("common.remark")}
          onChange={(p) => setEditForm({ ...editForm, ...p })}
          namePlaceholder={t("categories.newCat")}
          action={doEdit}
          beforeOpen={validateEdit}
          title={t("categories.saveEditCatTitle")}
          desc={t("categories.saveEditCatDesc", { name: editForm.name })}
          okText={t("common.save")}
          onCancel={() => { setEditingId(null); setErr(null); }}
          err={err}
        />
      )}

      {/* 分类卡片列表（新增/编辑时隐藏） */}
      {!creating && !editingId && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCats.length === 0 && <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>}
        {filteredCats.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{c.icon}</span>
                <span className="text-sm font-semibold text-slate-800">{c.name}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="text-xs text-slate-500 hover:text-teal-600 hover:underline"
                >
                  {t("common.edit")}
                </button>
                <DeleteButton
                  action={async () => { await deleteCategory(c.id); }}
                  title={t("categories.delTitle")}
                  desc={t("categories.delDesc", { name: c.name })}
                  okText={t("common.delete")}
                  label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                />
              </div>
            </div>
            {c.remark && (
              <p className="mt-2 text-xs text-slate-400">{c.remark}</p>
            )}
            <div className="mt-3">
              <a
                href={`/transactions?q=${encodeURIComponent(c.name)}`}
                className="inline-block rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100"
              >
                {t("tags.viewTx")}
              </a>
            </div>
          </div>
        ))}
      </div>
      )}

    </div>
  );
}
