"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ToastHost } from "./components/confirm";
import { buildNavGroupsFromMenus, type MenuRow, type MenuGroupRow, type DynNavItem } from "@/lib/nav";
import { investmentListHref, isValidInvestmentType } from "@/lib/investment-types";
import { ROLE, DEVICE, DEFAULT_LEDGER_ICON, DASHBOARD_PATH, LEDGER_COOKIE } from "@/lib/constants";

type LedgerOpt = { id: string; name: string; icon: string };

export function AppShell({
  userName,
  userRole,
  appName,
  appSlogan,
  ledgers,
  currentId,
  currentName,
  copyright,
  menus,
  groups,
  enabledIds,
  children,
}: {
  userName: string;
  userRole: string;
  appName: string;
  appSlogan: string;
  ledgers: LedgerOpt[];
  currentId: string;
  currentName: string;
  copyright: string;
  menus: MenuRow[];
  groups: MenuGroupRow[];
  enabledIds: string[] | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const locale = useLocale();
  const [pendingLedger, setPendingLedger] = useState<{ id: string; name: string } | null>(null);

  // 数据驱动导航：菜单表 + 分组 + 账本启用白名单 + 角色过滤（与 profile 页同源）
  const navGroups = buildNavGroupsFromMenus(menus, enabledIds, userRole, DEVICE.desktop, locale, groups);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    // 新增/编辑持仓页面：按 ?type= 高亮对应管理菜单
    // 路径取自 INVESTMENT_TYPES 单一数据源（含数字资产/收藏品/储蓄型保险/借贷），避免漏项
    if (pathname === "/investments/new" || (pathname.startsWith("/investments/") && pathname.endsWith("/edit"))) {
      const type = searchParams.get("type");
      return !!type && isValidInvestmentType(type) && investmentListHref(type) === href;
    }
    // /investments 只精确匹配，不匹配子页面（投资总览与各管理页平级）
    if (href === "/investments") return false;
    return pathname.startsWith(href + "/");
  };

  const navLink = (item: DynNavItem) => (
    <Link
      key={item.key}
      href={item.href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        isActive(item.href)
          ? "bg-teal-50 font-semibold text-teal-700"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span>{item.icon}</span>
      {item.name}
    </Link>
  );

  // 移动端底部 tab：仅取 deviceType==='mobile' 的菜单项；/add 作为居中 FAB
  const mobileItems = navGroups.flatMap((g) => g.items).filter((i) => i.deviceType === DEVICE.mobile);
  const addIdx = mobileItems.findIndex((i) => i.href === "/add");
  const beforeItems = addIdx >= 0 ? mobileItems.slice(0, addIdx) : mobileItems;
  const afterItems = addIdx >= 0 ? mobileItems.slice(addIdx + 1) : [];
  const addItem = addIdx >= 0 ? mobileItems[addIdx] : null;

  const mobileLink = (item: DynNavItem) => (
    <Link
      key={item.key}
      href={item.href}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] ${
        isActive(item.href) ? "font-semibold text-teal-600" : "text-slate-500"
      }`}
    >
      <span className="text-lg">{item.icon}</span>
      <span>{item.name}</span>
    </Link>
  );

  function onLedgerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    if (newId === currentId) return;
    const ledger = ledgers.find((l) => l.id === newId);
    if (!ledger) return;
    // 弹出确认框，用户确认后才切换 / Show confirm dialog before switching
    setPendingLedger({ id: newId, name: `${ledger.icon} ${ledger.name}` });
    // 重置 select 为当前账本，避免 UI 显示已切换
    e.target.value = currentId;
  }

  function confirmLedgerSwitch() {
    if (!pendingLedger) return;
    document.cookie = `${LEDGER_COOKIE}=${pendingLedger.id}; path=/; max-age=31536000`;
    window.location.href = DASHBOARD_PATH;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* 侧边栏（桌面 lg+）：数据驱动，由菜单管理 + 分组 + 账本启用白名单动态生成 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 font-bold text-white">
            R
          </div>
          <div>
            <div className="text-sm font-bold">{appName}</div>
            <div className="text-[10px] text-slate-400">{appSlogan || t("tagline")}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {navGroups.map((g) => (
            <Fragment key={g.group}>
              <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {g.name || g.group}
              </div>
              {g.items.map(navLink)}
            </Fragment>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="truncate text-sm font-medium">{userName}</div>
          <div className="text-[11px] text-slate-400">
            {userRole === ROLE.admin ? t("common.roleAdmin") : t("common.user")}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏：账本切换 + 语言 + 移动导航 + 退出 */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <span className="text-sm font-bold lg:hidden">{appName}</span>
          <select
            value={currentId}
            onChange={onLedgerChange}
            className="max-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500"
            title={t("top.ledger")}
          >
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.icon} {l.name}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
          {children}
        </main>
        {/* 底部版权（来自全局设置）/ Footer copyright from global settings */}
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-center text-[11px] text-slate-400">
          {copyright}
        </footer>

        {/* 移动端底部 tab bar（<lg）：仅 deviceType='mobile' 的菜单项；/add 为居中 FAB */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-end justify-around border-t border-slate-200 bg-white px-1 pb-1 pt-1 lg:hidden">
          {beforeItems.map(mobileLink)}
          {addItem && (
            <Link
              href={addItem.href}
              className="flex flex-1 flex-col items-center"
            >
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-xl text-white shadow-lg ring-4 ring-white">
                {addItem.icon}
              </span>
              <span className={`mt-0.5 text-[10px] ${isActive(addItem.href) ? "font-semibold text-teal-600" : "text-slate-500"}`}>
                {addItem.name}
              </span>
            </Link>
          )}
          {afterItems.map(mobileLink)}
        </nav>
      </div>
      {/* 账本切换确认框 / Ledger switch confirmation dialog */}
      {pendingLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-xl">
                {DEFAULT_LEDGER_ICON}
              </div>
              <h3 className="text-base font-bold text-slate-900">{t("top.ledgerSwitchTitle")}</h3>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              {t("top.ledgerSwitchDesc", { name: pendingLedger.name })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingLedger(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmLedgerSwitch}
                className="flex-1 rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastHost />
    </div>
  );
}
