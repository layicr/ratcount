"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { saveLedgerMenu } from "@/app/actions/user-menu";
import { ConfirmButton } from "../../components/confirm";
import { localizedName } from "@/lib/localize";

type MenuRow = {
  menuId: string;
  name: string; // 多语言名称 JSON（DB 存字符串）
  icon: string;
  menuGroupId: string;
  sort: number;
  statusCode: string;
  deviceType: string;
  link: string;
  remark: string | null;
};
type GroupRow = { menuGroupId: string; name: string; sort: number; remark: string | null };

/** 我的菜单：按分组勾选当前账本要显示的菜单项（menu_id 粒度，保存到 userMenuConfig） */
export function UserMenuEditor({
  menus,
  groups,
  enabledIds,
}: {
  menus: MenuRow[];
  groups: GroupRow[];
  enabledIds: string[] | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(enabledIds ?? menus.map((m) => m.menuId)),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2500);
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(groupIds: string[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      groupIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function doSave() {
    const r = await saveLedgerMenu([...checked]);
    if (r.ok) {
      flash(true, t("profile.menuSaved"));
      router.refresh();
    } else {
      flash(false, r.error ? t(r.error) : t("errors.invalidInput"));
    }
  }

  // 分组排序：menu_groups.sort 优先，其次 menuGroupId 字母序
  const groupMap = new Map(groups.map((g) => [g.menuGroupId, g]));
  const groupIds = [...new Set(menus.map((m) => m.menuGroupId))].sort((a, b) => {
    const sa = groupMap.get(a)?.sort ?? Number.MAX_SAFE_INTEGER;
    const sb = groupMap.get(b)?.sort ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });

  const groupName = (gid: string) => {
    const g = groupMap.get(gid);
    const n = g ? localizedName(g.name, locale) : "";
    return n || gid;
  };

  return (
    <div className="space-y-4">
      {/* 操作栏：统计 + 保存 + 恢复默认 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          {t("profile.menuDesc")} · 已选 {checked.size} / {menus.length}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChecked(new Set(menus.map((m) => m.menuId)))}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("profile.menuReset")}
          </button>
          <ConfirmButton
            action={doSave}
            title={t("profile.menuTitle")}
            desc={t("profile.menuSaved")}
            okText={t("common.save")}
          >
            <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
              {t("common.save")}
            </span>
          </ConfirmButton>
        </div>
      </div>

      {/* 分组勾选列表 */}
      {groupIds.map((gid) => {
        const items = menus
          .filter((m) => m.menuGroupId === gid)
          .sort((a, b) => a.sort - b.sort);
        if (items.length === 0) return null;
        const allOn = items.every((m) => checked.has(m.menuId));
        return (
          <div key={gid} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">{groupName(gid)}</h3>
              <button
                type="button"
                onClick={() => toggleAll(items.map((m) => m.menuId), !allOn)}
                className="text-xs text-slate-500 hover:text-teal-600"
              >
                {allOn ? t("menuMgmt.groupClearAll") : t("menuMgmt.groupSelectAll")}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((m) => (
                <label
                  key={m.menuId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                    checked.has(m.menuId)
                      ? "border-teal-300 bg-teal-50/60"
                      : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(m.menuId)}
                    onChange={() => toggle(m.menuId)}
                    className="h-4 w-4 accent-teal-600"
                  />
                  <span className="text-lg">{m.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">
                      {localizedName(m.name, locale)}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-slate-400">{m.link}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {menus.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {t("common.empty")}
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
