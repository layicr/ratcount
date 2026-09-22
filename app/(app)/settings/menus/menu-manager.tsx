"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import { createMenu, updateMenu, deleteMenu } from "@/app/actions/menus";
import { Pagination } from "../../components/pagination";
import { ConfirmButton, DeleteButton } from "../../components/confirm";
import { type MenuStatusCode, type MenuDeviceType, DEVICE, MENU_STATUS, SETTINGS_MENUS_PATH } from "@/lib/constants";
import { locales, localizedName, localeLabels, localizedNameSchema, type LocalizedName } from "@/lib/localize";
import { IconPicker } from "../../components/icon-picker";

type MenuRow = {
  menuId: string;
  name: string;
  icon: string;
  menuGroupId: string;
  sort: number;
  statusCode: string;
  deviceType: string;
  link: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
};
type GroupRow = { menuGroupId: string; name: string; sort: number; remark: string | null };

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

/** 菜单表单字段（显式声明，避免 useState 从 empty 推断出字面量枚举类型） */
type MenuForm = {
  menuId: string;
  name: LocalizedName;
  icon: string;
  menuGroupId: string;
  sort: number;
  statusCode: MenuStatusCode;
  deviceType: MenuDeviceType;
  link: string;
  remark: string;
  syncUsers: boolean;
};

const empty: MenuForm = {
  menuId: "", name: {} as LocalizedName, icon: "📄", menuGroupId: "",
  sort: 0, statusCode: MENU_STATUS.active, deviceType: DEVICE.desktop,
  link: "/", remark: "",
  syncUsers: false, // 是否同步并入用户白名单（新增/编辑时一次性生效）
};

/** 菜单管理界面：新增 / 编辑 / 删除全局导航菜单（数据驱动导航的唯一数据源）+ 搜索 + 分页 */
export function MenuManager({
  menus,
  groups,
  page,
  totalPages,
  total,
  q,
  device = "",
  status = "",
  pageSize,
  basePath = SETTINGS_MENUS_PATH,
  allowedPageSizes = [10, 20, 50, 100],
}: {
  menus: MenuRow[];
  groups: GroupRow[];
  page: number;
  totalPages: number;
  total: number;
  q: string;
  device?: string;
  status?: string;
  pageSize: number;
  basePath?: string;
  allowedPageSizes?: number[];
}) {
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [deviceFilter, setDeviceFilter] = useState(device || "all");
  const [statusFilter, setStatusFilter] = useState(status || "all");

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2500);
  }

  function doSearch() {
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    if (deviceFilter !== "all") params.set("device", deviceFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", "1");
    params.set("pageSize", String(pageSize));
    window.location.href = `${basePath}?${params.toString()}`;
  }

  function startCreate() {
    setForm({ ...empty, menuGroupId: groups[0]?.menuGroupId ?? "" });
    setFormErr(null);
    setCreating(true);
    setEditingId(null);
  }
  function startEdit(m: MenuRow) {
    setForm({
      menuId: m.menuId, name: parseName(m.name), icon: m.icon,
      menuGroupId: m.menuGroupId, sort: m.sort,
      statusCode: m.statusCode as MenuStatusCode, deviceType: m.deviceType as MenuDeviceType,
      link: m.link, remark: m.remark ?? "",
      syncUsers: false,
    });
    setFormErr(null);
    setEditingId(m.menuId);
    setCreating(false);
  }
  function closeForm() {
    setCreating(false);
    setEditingId(null);
    setFormErr(null);
  }

  function validateBeforeSave(): boolean {
    if (!form.menuId.trim()) { setFormErr(t("menuMgmt.idRequired")); return false; }
    if (!/^[a-zA-Z0-9._-]+$/.test(form.menuId.trim())) { setFormErr(t("menuMgmt.invalidId")); return false; }
    const parsed = localizedNameSchema.safeParse(form.name);
    if (!parsed.success) { setFormErr(t(parsed.error.issues[0]?.message ?? "common.nameRequired")); return false; }
    if (!form.menuGroupId) { setFormErr(t("common.groupRequired")); return false; }
    if (!form.link.trim()) { setFormErr(t("menuMgmt.linkRequired")); return false; }
    if (!form.icon.trim()) { setFormErr(t("common.iconRequired")); return false; }
    setFormErr(null);
    return true;
  }

  async function doSubmit() {
    if (!validateBeforeSave()) return;
    const payload = {
      name: form.name, icon: form.icon.trim(),
      menuGroupId: form.menuGroupId, sort: Number.isFinite(Number(form.sort)) ? Number(form.sort) : 0,
      statusCode: form.statusCode, deviceType: form.deviceType, link: form.link.trim(),
      remark: form.remark.trim() || null,
    };
    const r = creating
      ? await createMenu({ menuId: form.menuId.trim(), ...payload }, form.syncUsers)
      : await updateMenu(editingId!, payload, form.syncUsers);
    if (r.ok) {
      closeForm();
      flash(true, t("menuMgmt.saved"));
      router.refresh();
    } else {
      setFormErr(r.error ? t(r.error) : t("errors.invalidInput"));
    }
  }

  const groupName = (gid: string) => {
    const g = groups.find((x) => x.menuGroupId === gid);
    return g ? localizedName(g.name, locale) || gid : gid;
  };

  return (
    <div className="space-y-4">
      {/* 工具栏：新增（居左） + 搜索 + 清空 / Toolbar: create (left) + search + clear（新增/编辑时隐藏） */}
      {!creating && !editingId && (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
        {!creating && !editingId && (
          <button onClick={startCreate} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm text-white hover:bg-teal-700">
            {t("common.add")}
          </button>
        )}
        <select
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-teal-500"
        >
          <option value="all">{t("common.all")}</option>
          <option value={DEVICE.desktop}>{t("menuMgmt.deviceDesktop")}</option>
          <option value={DEVICE.mobile}>{t("menuMgmt.deviceMobile")}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-teal-500"
        >
          <option value="all">{t("common.all")}</option>
          <option value={MENU_STATUS.active}>{t("common.active")}</option>
          <option value={MENU_STATUS.disabled}>{t("common.statusDisabled")}</option>
        </select>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500"
        />
        <button
          onClick={doSearch}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm text-white hover:bg-teal-700"
        >
          {t("common.filter")}
        </button>
        <button
          onClick={() => {
            setSearchInput("");
            setDeviceFilter("all");
            setStatusFilter("all");
            const params = new URLSearchParams();
            params.set("page", "1");
            params.set("pageSize", String(pageSize));
            window.location.href = `${basePath}?${params.toString()}`;
          }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
        >
          {t("common.clear")}
        </button>
      </div>
      )}

      {/* 新增/编辑表单 */}
      {(creating || editingId) && (
        <form className="space-y-3 rounded-2xl border border-teal-200 bg-white p-5" onSubmit={(e) => e.preventDefault()}>
          <h2 className="text-sm font-bold text-slate-800">
            {creating ? t("common.add") : t("common.edit")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("menuMgmt.idLabel")} <span className="text-red-500">*</span></label>
              <input
                value={form.menuId}
                onChange={(e) => setForm({ ...form, menuId: e.target.value })}
                maxLength={64}
                disabled={!!editingId}
                placeholder="nav.investOverview"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!editingId && <p className="mt-0.5 text-[10px] text-slate-400">{t("menuMgmt.idHint")}</p>}
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
              <label className="mb-1 block text-xs text-slate-500">{t("common.icon")} <span className="text-red-500">*</span></label>
              <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.group")} <span className="text-red-500">*</span></label>
              <select
                value={form.menuGroupId}
                onChange={(e) => setForm({ ...form, menuGroupId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.menuGroupId} value={g.menuGroupId}>
                    {localizedName(g.name, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.sort")}</label>
              <input
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("common.status")}</label>
              <select
                value={form.statusCode}
                onChange={(e) => setForm({ ...form, statusCode: e.target.value as MenuStatusCode })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                <option value={MENU_STATUS.active}>{t("common.active")}</option>
                <option value={MENU_STATUS.disabled}>{t("common.statusDisabled")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("menuMgmt.device")}</label>
              <select
                value={form.deviceType}
                onChange={(e) => setForm({ ...form, deviceType: e.target.value as MenuDeviceType })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                <option value={DEVICE.desktop}>{t("menuMgmt.deviceDesktop")}</option>
                <option value={DEVICE.mobile}>{t("menuMgmt.deviceMobile")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("menuMgmt.syncUsers")}</label>
              <select
                value={form.syncUsers ? "yes" : "no"}
                onChange={(e) => setForm({ ...form, syncUsers: e.target.value === "yes" })}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="no">{t("common.no")}</option>
                <option value="yes">{t("common.yes")}</option>
              </select>
              <p className="mt-0.5 text-[10px] text-slate-400">{t("menuMgmt.syncUsersHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{t("menuMgmt.link")} <span className="text-red-500">*</span></label>
              <input
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                maxLength={200}
                placeholder="/investments"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
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
              title={creating ? t("common.add") : t("menuMgmt.saveEditTitle")}
              desc={creating ? t("common.createDesc") : t("common.saveEditDesc", { id: editingId ?? "menu" })}
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

      {/* 菜单列表（新增/编辑时隐藏） */}
      {!creating && !editingId && (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 text-center">{t("menuMgmt.idLabel")}</th>
                <th>{t("common.name")}</th>
                <th>{t("common.group")}</th>
                <th className="text-right">{t("common.sort")}</th>
                <th className="text-center">{t("common.status")}</th>
                <th className="text-center">{t("menuMgmt.device")}</th>
                <th>{t("menuMgmt.link")}</th>
                <th>{t("common.createdAt")}</th>
                <th>{t("common.updatedAt")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => (
                <tr key={m.menuId} className="border-b border-slate-50">
                  <td className="py-2 text-center font-mono text-xs text-slate-700">{m.menuId}</td>
                  <td className="text-slate-700">
                    <span className="mr-1">{m.icon}</span>
                    {localizedName(m.name, locale)}
                  </td>
                  <td className="text-xs text-slate-500">{groupName(m.menuGroupId)}</td>
                  <td className="text-right text-slate-500">{m.sort}</td>
                  <td className="text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${m.statusCode === MENU_STATUS.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                      {m.statusCode === MENU_STATUS.active ? t("common.active") : t("common.statusDisabled")}
                    </span>
                  </td>
                  <td className="text-center text-xs text-slate-500">
                    {m.deviceType === DEVICE.mobile ? t("menuMgmt.deviceMobile") : t("menuMgmt.deviceDesktop")}
                  </td>
                  <td className="font-mono text-xs text-slate-500">{m.link}</td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">
                    {f.dateTime(new Date(m.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">
                    {f.dateTime(new Date(m.updatedAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(m)} className="text-xs text-slate-500 hover:text-teal-600">
                        {t("common.edit")}
                      </button>
                      <DeleteButton
                        action={async () => {
                          const r = await deleteMenu(m.menuId);
                          if (r.ok) router.refresh();
                          else flash(false, r.error ? t(r.error) : t("errors.invalidInput"));
                        }}
                        title={t("menuMgmt.delTitle")}
                        desc={t("menuMgmt.delDesc", { name: localizedName(m.name, locale) })}
                        okText={t("common.delete")}
                        label={<span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {menus.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-sm text-slate-400">{t("common.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页控件（与日志列表共用） */}
        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            q={q}
            device={deviceFilter !== "all" ? deviceFilter : undefined}
            status={statusFilter !== "all" ? statusFilter : undefined}
            pageSize={pageSize}
            basePath={basePath}
            allowedPageSizes={allowedPageSizes}
          />
        )}
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
