"use client";

import { useState } from "react";
import { createTag, deleteTag, updateTag } from "@/app/actions/common";
import { useTranslations } from "next-intl";
import { ConfirmButton, DeleteButton } from "../components/confirm";
import { NameRemarkForm } from "../components/name-remark-form";
import { ColorPicker } from "../components/color-picker";

type Tag = { id: string; name: string; color: string; remark: string | null };

/** 标签管理，独立页面 /tags — 卡片列表形式（与项目管理一致），支持编辑/颜色选择器 */
export function TagsManager({ tags }: { tags: Tag[] }) {
  const t = useTranslations();
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
    if (!tagForm.name.trim()) { setErr("common.nameRequired"); return false; }
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
    if (!editForm.name.trim()) { setErr("common.nameRequired"); return false; }
    return true;
  }

  return (
    <div className="space-y-4">
      {/* 新增按钮（居左，点击后出现表单） */}
      {!creating && !editingId && (
        <button onClick={() => { setCreating(true); setErr(null); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
          {t("common.add")}
        </button>
      )}

      {/* 新增标签表单（点击新增按钮后出现） */}
      {creating && (
        <NameRemarkForm
          picker={<ColorPicker value={tagForm.color} onChange={(color) => setTagForm({ ...tagForm, color })} size="sm" />}
          name={tagForm.name}
          remark={tagForm.remark}
          onChange={(p) => setTagForm({ ...tagForm, ...p })}
          namePlaceholder={t("tags.newTag")}
          nameLabel={t("common.name")}
          remarkLabel={t("common.remark")}
          action={doCreate}
          beforeOpen={validateCreate}
          title={t("tags.saveTagTitle")}
          desc={t("common.createDesc")}
          okText={t("common.save")}
          onCancel={() => { setCreating(false); setErr(null); }}
          err={err}
        />
      )}

      {/* 编辑标签表单（点击编辑按钮后出现，独立表单不在卡片内） */}
      {editingId && (
        <NameRemarkForm
          picker={<ColorPicker value={editForm.color} onChange={(color) => setEditForm({ ...editForm, color })} size="sm" />}
          name={editForm.name}
          remark={editForm.remark}
          onChange={(p) => setEditForm({ ...editForm, ...p })}
          namePlaceholder={t("tags.newTag")}
          nameLabel={t("common.name")}
          remarkLabel={t("common.remark")}
          action={doEdit}
          beforeOpen={validateEdit}
          title={t("tags.saveEditTitle")}
          desc={t("common.saveEditDesc", { id: editForm.name })}
          okText={t("common.save")}
          onCancel={() => { setEditingId(null); setErr(null); }}
          err={err}
        />
      )}

      {/* 标签卡片列表（新增/编辑时隐藏） */}
      {!creating && !editingId && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tags.length === 0 && <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("common.empty")}</p>}
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
                <DeleteButton
                  action={async () => { await deleteTag(tg.id); }}
                  title={t("tags.delTagTitle")}
                  desc={t("tags.delTagDesc", { name: tg.name })}
                  okText={t("common.delete")}
                  label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                />
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
      )}

    </div>
  );
}
