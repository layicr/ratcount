import { Fragment } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { DEVICE } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { getActiveMenus } from "@/app/actions/menus";
import { getMenuGroupsForNav } from "@/app/actions/menu-groups";
import { getLedgerMenuIds } from "@/app/actions/user-menu";
import { getUserPreferences } from "@/app/actions/user-preferences";
import { buildNavGroupsFromMenus } from "@/lib/nav";
import type { DynNavGroup } from "@/lib/nav";
import { ProfilePanel } from "./profile-panel";
import { getEnabledLocales, getLocaleLabels, getDefaultLocale } from "@/lib/languages";
import { getMessages, getLocale } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 个人中心：个人信息 + 按分组展示当前用户可用菜单（menus 表数据驱动，与侧边栏同源） */
export default async function ProfilePage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const locale = await getLocale();
  const d = (await getMessages()) as unknown as AppDict;
  const prefs = await getUserPreferences();

  // 语言选项由「语言配置」(languages 表) 驱动：仅列启用的语言，显示名取配置的 nativeName，并标记全局默认语言
  const [enabledLocales, localeLabelsMap, defaultLocale] = await Promise.all([
    getEnabledLocales(),
    getLocaleLabels(),
    getDefaultLocale(),
  ]);
  const localeOptions = enabledLocales.map((code) => ({ code, label: localeLabelsMap[code] ?? code }));

  // 数据驱动导航：投资 / 保障分区卡片，与侧边栏同源（menus + userMenuConfig + 角色过滤）
  const [menus, groups, enabledIds] = await Promise.all([
    getActiveMenus(),
    getMenuGroupsForNav(),
    getLedgerMenuIds(ledger.id, user.id),
  ]);
  const navGroups = buildNavGroupsFromMenus(menus, enabledIds, user.role, DEVICE.desktop, locale, groups);

  // 分组强调条配色：仅投资/保障上色，其余分组（记账/管理/动态）用中性色
  const GROUP_ACCENT: Record<string, string> = {
    invest: "bg-orange-200",
    protection: "bg-sky-200",
  };
  const groupAccent = (gid: string) => GROUP_ACCENT[gid] ?? "bg-slate-200";

  /** 分区卡片：按 menuGroupId 分组渲染当前用户可用菜单项（数据驱动，标题与强调条色均取自分组本身） */
  const navCard = (g: DynNavGroup) => {
    if (g.items.length === 0) return null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{g.name}</h2>
        <div className="grid grid-cols-4 gap-2">
          {g.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-center transition hover:bg-teal-50"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] text-slate-600">{item.name}</span>
            </Link>
          ))}
        </div>
        <div className={`mt-2 h-1 rounded-full ${groupAccent(g.group)}`} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.profile.title}</h1>
      <ProfilePanel userName={user.name ?? ""} email={user.email ?? ""} bio={prefs?.bio ?? ""} localeOptions={localeOptions} defaultLocale={defaultLocale} />

      {/* 按分组展示当前用户可用菜单（与侧边栏同源：menus 表 + 账本启用 + 角色过滤） */}
      <div className="grid gap-4 lg:grid-cols-2">
        {navGroups.map((g) => (
          <Fragment key={g.group}>{navCard(g)}</Fragment>
        ))}
      </div>
    </div>
  );
}
