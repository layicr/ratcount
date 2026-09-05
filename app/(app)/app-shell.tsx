"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ToastHost } from "./components/confirm";

/** 导航配置：记账 / 管理 两组（label 用 i18n key） */
const NAV = [
  { href: "/dashboard", key: "nav.dashboard", icon: "🎯" },
  { href: "/transactions", key: "nav.transactions", icon: "🧾" },
  { href: "/add", key: "nav.add", icon: "⚡" },
  { href: "/calendar", key: "nav.calendar", icon: "📅" },
  { href: "/accounts", key: "nav.accounts", icon: "💳" },
  { href: "/balance", key: "nav.balance", icon: "⚖️" },
  { href: "/reports", key: "nav.reports", icon: "🌟" },
];
const MGMT = [
  { href: "/ledgers", key: "nav.ledgers", icon: "📒" },
  { href: "/projects", key: "nav.projects", icon: "📁" },
  { href: "/recurring", key: "nav.recurring", icon: "🔁" },
  { href: "/categories", key: "nav.categories", icon: "📂" },
  { href: "/tags", key: "nav.tags", icon: "🏷️" },
  { href: "/settings", key: "nav.settings", icon: "⚙️" },
  { href: "/profile", key: "nav.profile", icon: "🍀" },
];

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
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const [pendingLedger, setPendingLedger] = useState<{ id: string; name: string } | null>(null);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // 根据用户角色过滤管理菜单：普通用户不显示全局设置 / Filter management menu by user role
  const filteredMgmt = MGMT.filter((item) => {
    if (item.href === "/settings") {
      return userRole === "admin";
    }
    return true;
  });

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
    document.cookie = `ratcount_ledger=${pendingLedger.id}; path=/; max-age=31536000`;
    window.location.href = "/dashboard";
  }

  const navBtn = (item: { href: string; key: string; icon: string }) => (
    <Link
      key={item.href}
      href={item.href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        isActive(item.href)
          ? "bg-teal-50 font-semibold text-teal-700"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span>{item.icon}</span>
      {t(item.key)}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* 侧边栏（桌面 lg+） */}
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
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("nav.groupBook")}
          </div>
          {NAV.map(navBtn)}
          <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("nav.groupManage")}
          </div>
          {filteredMgmt.map(navBtn)}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="truncate text-sm font-medium">{userName}</div>
          <div className="text-[11px] text-slate-400">
            {userRole === "admin" ? t("dashboard.roleAdmin") : t("dashboard.roleUser")}
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

        {/* 移动端横向导航已移除，改为底部 tab bar（见下方） */}

        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
          {children}
        </main>
        {/* 底部版权（来自全局设置）/ Footer copyright from global settings */}
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-center text-[11px] text-slate-400">
          {copyright}
        </footer>

        {/* 移动端底部 tab bar（<lg）：仪表盘 / 流水 / 记一笔 / 报表 / 我的 */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-end justify-around border-t border-slate-200 bg-white px-1 pb-1 pt-1 lg:hidden">
          {[
            { href: "/dashboard", key: "nav.dashboard", icon: "🎯" },
            { href: "/transactions", key: "nav.transactions", icon: "🧾" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] ${
                isActive(item.href) ? "font-semibold text-teal-600" : "text-slate-500"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{t(item.key)}</span>
            </Link>
          ))}
          {/* 中间突出的记一笔按钮 */}
          <Link
            href="/add"
            className={`flex flex-1 flex-col items-center ${isActive("/add") ? "" : ""}`}
          >
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-xl text-white shadow-lg ring-4 ring-white">
              ⚡
            </span>
            <span className={`mt-0.5 text-[10px] ${isActive("/add") ? "font-semibold text-teal-600" : "text-slate-500"}`}>
              {t("nav.add")}
            </span>
          </Link>
          {[
            { href: "/reports", key: "nav.reports", icon: "🌟" },
            { href: "/profile", key: "nav.profile", icon: "🍀" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] ${
                isActive(item.href) ? "font-semibold text-teal-600" : "text-slate-500"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{t(item.key)}</span>
            </Link>
          ))}
        </nav>
      </div>
      {/* 账本切换确认框 / Ledger switch confirmation dialog */}
      {pendingLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-xl">
                📒
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
