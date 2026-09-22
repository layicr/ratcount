"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import { createMenuGroup, updateMenuGroup, deleteMenuGroup } from "@/app/actions/menu-groups";
import { ConfirmButton, DeleteButton } from "../../components/confirm";
import { locales, localizedName, localeLabels, localizedNameSchema, type LocalizedName } from "@/lib/localize";

type GroupRow = { menuGroupId: string; name: string; sort: number; remark: string | null; createdAt: string; updatedAt: string };

/** DB 存储的 name（JSON 字符串）解析为对象；失败回退空对象 */
function parseName(v: unknown): LocalizedName {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as LocalizedName;
    } catch {
      return {};
    }
  }
  return (v as LocalizedName) ?? {};
}

const empty = { menuGroupId: "", name: {} as LocalizedName, sort: 0, remark: "" };

/** 菜单分组管理界面：新增 / 编辑 / 删除全局导航分组 */
export function MenuGroupManager({ groups }: { groups: GroupRow[] }) {
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [formErr, setFormErr] = useState<string | null>(null);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2500);
  }

  function startCreate() {
    setForm(empty);
    setFormErr(null);
    setCreating(true);
    setEditingId(null);
  }
  function startEdit(g: GroupRow) {
    setForm({ menuGroupId: g.menuGroupId, name: parseName(g.name), sort: g.sort, remark: g.remark ?? "" });
    setFormErr(null);
    setEditingId(g.menuGroupId);
    setCreating(false);
  }
  function closeForm() {
    setCreating(false);
    setEditingId(null);
    setFormErr(null);
  }

  function validateBeforeSave(): boolean {
    if (!form.menuGroupId.trim()) { setFormErr(t("menuMgmt.groupIdRequired")); return false; }
    if (!/^[a-zA-Z0-9._-]+$/.test(form.menuGroupId.trim())) { setFormErr(t("menuMgmt.invalidGroupId")); return false; }
    const parsed = localizedNameSchema.safeParse(form.name);
    if (!parsed.success) { setFormErr(t(parsed.error.issues[0]?.message ?? "common.nameRequired")); return false; }
    setFormErr(null);
    return true;
  }

  async function doSubmit() {
    if (!validateBeforeSave()) return;
    const payload = {
      name: form.name,
      sort: Number.isFinite(Number(form.sort)) ? Number(form.sort) : 0,
      remark: form.remark.trim() || null,
    };
    const r = creating
      ? await createMenuGroup({ menuGroupId: form.menuGroupId.trim(), ...payload })
      : await updateMenuGroup(editingId!, payload);
    if (r.ok) {
      closeForm();
      flash(true, t("menuMgmt.groupSaved"));
      router.refresh();
    } else {
      setFormErr(r.error ? t(r.error) : t("errors.invalidInput"));
    }
  }

  return (
    <div className="space-y-4">
      {/* 新增/编辑表单 */}
      {(creating || editingId) && (
        <form className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5" onSubmit={(e) => e.preventDefault()}>
          <h2 className="text-sm font-bold text-slate-800">
            {creating ? t("common.add") : t("menuMgmt.groupEdit")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("menuMgmt.groupIdLabel")} <span className="text-red-500">*</span></label>
              <input
                value={form.menuGroupId}
                onChange={(e) => setForm({ ...form, menuGroupId: e.target.value })}
                maxLength={64}
                disabled={!!editingId}
                placeholder="book"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!editingId && <p className="mt-0.5 text-[10px] text-slate-400">{t("menuMgmt.groupIdHint")}</p>}
            </div>
            {/* 多语言名称：按 locales 循环渲染（新增语言自动扩展） */}
            {locales.map((loc) => (
              <div key={loc}>
                <label className="mb-1 block text-xs text-slate-500">
                  {t("common.name")}（{localeLabels[loc]}） *
                </label>
                <input
                  value={form.name[loc] ?? ""}
                  onChange={(e) => setForm({ ...form, name: { ...form.name, [loc]: e.target.value } })}
                  maxLength={50}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.sort")}</label>
              <input
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="mb-1 block text-xs text-slate-500">{t("common.remark")}</label>
              <input
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
          </div>
          {formErr && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {formErr}
            </p>
          )}
          <div className="flex gap-2">
            <ConfirmButton
              action={doSubmit}
              beforeOpen={validateBeforeSave}
              title={creating ? t("common.add") : t("menuMgmt.groupSaveEditTitle")}
              desc={creating ? t("common.createDesc") : t("common.saveEditDesc", { id: editingId ?? "group" })}
              okText={t("common.save")}
            >
              <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{t("common.save")}</span>
            </ConfirmButton>
            <button type="button" onClick={closeForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {/* 分组列表（新增/编辑时隐藏） */}
      {!creating && !editingId && (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3">
          {!creating && !editingId && (
            <button onClick={startCreate} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
              {t("common.add")}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2">{t("menuMgmt.groupIdLabel")}</th>
                <th>{t("common.name")}</th>
                <th className="text-right">{t("common.sort")}</th>
                <th className="text-right">{t("common.remark")}</th>
                <th className="text-right">{t("common.createdAt")}</th>
                <th className="text-right">{t("common.updatedAt")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.menuGroupId} className="border-b border-slate-50">
                  <td className="py-2 font-mono text-xs text-slate-700">{g.menuGroupId}</td>
                  <td className="text-slate-700">{localizedName(g.name, locale)}</td>
                  <td className="text-right text-slate-500">{g.sort}</td>
                  <td className="text-xs text-slate-500 text-right">{g.remark || "—"}</td>
                  <td className="text-xs text-slate-400 whitespace-nowrap text-right">
                    {f.dateTime(new Date(g.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-xs text-slate-400 whitespace-nowrap text-right">
                    {f.dateTime(new Date(g.updatedAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(g)} className="text-xs text-slate-500 hover:text-teal-600">
                        {t("common.edit")}
                      </button>
                      <DeleteButton
                        action={async () => { await deleteMenuGroup(g.menuGroupId); router.refresh(); }}
                        title={t("menuMgmt.groupDelTitle")}
                        desc={t("menuMgmt.groupDelDesc", { name: localizedName(g.name, locale) })}
                        okText={t("common.delete")}
                        label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-400">{t("common.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
