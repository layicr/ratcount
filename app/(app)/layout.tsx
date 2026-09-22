import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getMyLedgers, getCurrentLedgerId, ensureDefaultLedger } from "@/lib/ledger";
import { getSetting, getAppName, getAppSlogan } from "@/lib/settings";
import { SETTING_KEY } from "@/lib/constants";
import { AppShell } from "./app-shell";
import { getMessages, getLocale } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";
import { getActiveMenus } from "@/app/actions/menus";
import { getMenuGroupsForNav } from "@/app/actions/menu-groups";
import { getLedgerMenuIds } from "@/app/actions/user-menu";

/** 应用布局：登录后才能进入（scopeGuard） */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const locale = await getLocale();

  // 登录用户无账本时自动建一个默认账本，避免停在「暂无账本」
  try {
    await ensureDefaultLedger(user.id, locale);
  } catch {
    // 建账本失败则继续；下方会按是否拥有账本给出兜底提示
  }

  const ledgers = await getMyLedgers(user.id);
  const currentId = await getCurrentLedgerId();
  const copyright = (await getSetting(SETTING_KEY.copyright)) ?? "";
  // 应用名 / 应用宣言加载顺序：DB 全局设置（管理员可改）→ 静态兜底（见 getAppName / getAppSlogan）
  const appName = await getAppName(locale);
  const appSlogan = await getAppSlogan(locale);
  const d = (await getMessages()) as unknown as AppDict;
  if (!currentId || ledgers.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow">
          <h1 className="text-lg font-bold text-slate-900">{d.layout.noLedger}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {d.layout.noLedgerDesc}
          </p>
        </div>
      </main>
    );
  }

  const current = ledgers.find((l) => l.ledger.id === currentId)?.ledger;

  // 数据驱动导航：菜单表 + 分组 + 当前账本启用白名单（与 profile 页同源）
  const [menus, groups, enabledIds] = await Promise.all([
    getActiveMenus(),
    getMenuGroupsForNav(),
    getLedgerMenuIds(currentId, user.id),
  ]);

  return (
    <AppShell
      userName={user.name ?? d.common.user}
      userRole={user.role}
      appName={appName}
      appSlogan={appSlogan}
      ledgers={ledgers.map((l) => ({
        id: l.ledger.id,
        name: l.ledger.name,
        icon: l.ledger.icon,
      }))}
      currentId={currentId}
      currentName={current?.name ?? ""}
      copyright={copyright}
      menus={menus}
      groups={groups}
      enabledIds={enabledIds}
    >
      {children}
    </AppShell>
  );
}
