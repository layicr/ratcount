"use client";

import { useState } from "react";
import { createCategory, deleteCategory, updateCategory, createTag, deleteTag, updateTag } from "@/app/actions/meta";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../components/confirm";
import { IconPicker } from "../components/icon-picker";
import { ColorPicker } from "../components/color-picker";

type Cat = { id: string; name: string; icon: string; type: string; remark: string | null };
type Tag = { id: string; name: string; color: string; remark: string | null };

/** 分类管理（收入 / 支出），独立页面 /categories — 卡片列表形式，支持编辑/备注 */
export function CategoriesManager({ cats }: { cats: Cat[] }) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [catForm, setCatForm] = useState({ name: "", icon: "📦", type: "expense" as "income" | "expense", remark: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", icon: "📦", type: "expense" as "income" | "expense", remark: "" });
  const [err, setErr] = useState<string | null>(null);

  const filteredCats = cats.filter((c) => c.type === activeTab);

  function switchTab(tab: "expense" | "income") {
    setActiveTab(tab);
    setCreating(false);
    setEditingId(null);
    setErr(null);
    setCatForm((f) => ({ ...f, type: tab }));
  }

  async function doCreate() {
    setErr(null);
    const r = await createCategory(catForm);
    if (r.ok) { setCatForm({ name: "", icon: "📦", type: "expense", remark: "" }); setCreating(false); }
    else setErr(r.error);
  }

  function validateCreate(): boolean {
    if (!catForm.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }

  function startEdit(c: Cat) {
    setEditingId(c.id);
    setEditForm({ name: c.name, icon: c.icon, type: (c.type as "income" | "expense"), remark: c.remark ?? "" });
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
    if (!editForm.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* Tab 切换 + 新增按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchTab("expense")}
            className={`rounded-md px-4 py-1.5 text-sm transition ${activeTab === "expense" ? "bg-white text-teal-700 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("tags.expenseCat")}
          </button>
          <button
            type="button"
            onClick={() => switchTab("income")}
            className={`rounded-md px-4 py-1.5 text-sm transition ${activeTab === "income" ? "bg-white text-teal-700 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("tags.incomeCat")}
          </button>
        </div>
        {!creating && !editingId && (
          <button onClick={() => { setCreating(true); setErr(null); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {t("tags.addCat")}
          </button>
        )}
      </div>

      {/* 新增分类表单 */}
      {creating && (
        <div className="rounded-2xl border border-teal-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-3">
            <IconPicker value={catForm.icon} onChange={(icon) => setCatForm({ ...catForm, icon })} size="sm" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <input
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder={t("tags.newCat")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={catForm.remark}
                onChange={(e) => setCatForm({ ...catForm, remark: e.target.value })}
                placeholder={t("tags.remarkPlaceholder")}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <ConfirmButton
                action={doCreate}
                beforeOpen={validateCreate}
                title={t("tags.saveCatTitle")}
                desc={t("tags.saveCatDesc", { name: catForm.name })}
                okText={t("tags.addCat")}
              >
                <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("tags.addCat")}</span>
              </ConfirmButton>
              <button type="button" onClick={() => { setCreating(false); setErr(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                {t("common.cancel")}
              </button>
            </div>
          </div>
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
        </div>
      )}

      {/* 编辑分类表单（独立显示，不在卡片内） */}
      {editingId && (
        <div className="rounded-2xl border border-teal-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-3">
            <IconPicker value={editForm.icon} onChange={(icon) => setEditForm({ ...editForm, icon })} size="sm" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("tags.newCat")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder={t("tags.remarkPlaceholder")}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <ConfirmButton
                action={doEdit}
                beforeOpen={validateEdit}
                title={t("tags.saveEditCatTitle")}
                desc={t("tags.saveEditCatDesc", { name: editForm.name })}
                okText={t("common.save")}
              >
                <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
              </ConfirmButton>
              <button type="button" onClick={() => { setEditingId(null); setErr(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                {t("common.cancel")}
              </button>
            </div>
          </div>
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
        </div>
      )}

      {/* 分类卡片列表（按当前 tab 过滤） */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCats.length === 0 && <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("tags.empty")}</p>}
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
                <ConfirmButton
                  danger
                  action={async () => { await deleteCategory(c.id); }}
                  title={t("tags.delTitle")}
                  desc={t("tags.delDesc", { name: c.name })}
                  okText={t("common.delete")}
                >
                  <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
                </ConfirmButton>
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
    </div>
  );
}

/** 标签管理，独立页面 /tags — 卡片列表形式（与项目管理一致），支持编辑/颜色选择器 */
export function TagsManager({ tags }: { tags: Tag[] }) {
  const t = useT();
  const [tagForm, setTagForm] = useState({ name: "", color: "#0d9488", remark: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "#0d9488", remark: "" });
  const [err, setErr] = useState<string | null>(null);

  async function doCreate() {
    setErr(null);
    const r = await createTag(tagForm);
    if (r.ok) { setTagForm({ name: "", color: "#0d9488", remark: "" }); setCreating(false); }
    else setErr(r.error);
  }

  function validateCreate(): boolean {
    if (!tagForm.name.trim()) { setErr(t("common.nameRequired")); return false; }
    return true;
  }

  function startEdit(tg: Tag) {
    setEditingId(tg.id);
    setEditForm({ name: tg.name, color: tg.color, remark: tg.remark ?? "" });
    setErr(null);
  }

  async function doEdit() {
    if (!editingId) return;
    setErr(null);
    const r = await updateTag(editingId, editForm);
    if (r.ok) {
      setEditingId(null);
    } else setErr(r.error);
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
          {t("tags.add")}
        </button>
      )}

      {/* 新增标签表单（点击新增按钮后出现） */}
      {creating && (
        <div className="rounded-2xl border border-teal-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-3">
            <ColorPicker value={tagForm.color} onChange={(color) => setTagForm({ ...tagForm, color })} size="sm" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <input
                value={tagForm.name}
                onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                placeholder={t("tags.newTag")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={tagForm.remark}
                onChange={(e) => setTagForm({ ...tagForm, remark: e.target.value })}
                placeholder={t("tags.remarkPlaceholder")}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <ConfirmButton
                action={doCreate}
                beforeOpen={validateCreate}
                title={t("tags.saveTagTitle")}
                desc={t("tags.saveTagDesc", { name: tagForm.name })}
                okText={t("tags.add")}
              >
                <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("tags.add")}</span>
              </ConfirmButton>
              <button type="button" onClick={() => { setCreating(false); setErr(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                {t("common.cancel")}
              </button>
            </div>
          </div>
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
        </div>
      )}

      {/* 编辑标签表单（点击编辑按钮后出现，独立表单不在卡片内） */}
      {editingId && (
        <div className="rounded-2xl border border-teal-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-3">
            <ColorPicker value={editForm.color} onChange={(color) => setEditForm({ ...editForm, color })} size="sm" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("tags.newTag")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder={t("tags.remarkPlaceholder")}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <ConfirmButton
                action={doEdit}
                beforeOpen={validateEdit}
                title={t("tags.saveEditTitle")}
                desc={t("tags.saveEditDesc", { name: editForm.name })}
                okText={t("common.save")}
              >
                <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
              </ConfirmButton>
              <button type="button" onClick={() => { setEditingId(null); setErr(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                {t("common.cancel")}
              </button>
            </div>
          </div>
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t(err) !== err ? t(err) : err}</p>}
        </div>
      )}

      {/* 标签卡片列表（只展示，不在卡片内编辑） */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tags.length === 0 && <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("tags.empty")}</p>}
        {tags.map((tg) => (
          <div key={tg.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" style={{ background: tg.color }} />
                <span className="text-sm font-semibold text-slate-800">{tg.name}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(tg)}
                  className="text-xs text-slate-500 hover:text-teal-600 hover:underline"
                >
                  {t("common.edit")}
                </button>
                <ConfirmButton
                  danger
                  action={async () => { await deleteTag(tg.id); }}
                  title={t("tags.delTagTitle")}
                  desc={t("tags.delTagDesc", { name: tg.name })}
                  okText={t("common.delete")}
                >
                  <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
                </ConfirmButton>
              </div>
            </div>
            {tg.remark && (
              <p className="mt-2 text-xs text-slate-400">{tg.remark}</p>
            )}
            <div className="mt-3">
              <a
                href={`/transactions?q=${encodeURIComponent(tg.name)}`}
                className="inline-block rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100"
              >
                {t("tags.viewTx")}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
