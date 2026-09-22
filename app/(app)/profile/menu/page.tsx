import Link from "next/link";
import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { getActiveMenus } from "@/app/actions/menus";
import { getMenuGroupsForNav } from "@/app/actions/menu-groups";
import { getLedgerMenuIds } from "@/app/actions/user-menu";
import { UserMenuEditor } from "./user-menu-editor";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 我的菜单：按分组勾选当前账本要显示的菜单项（menus 表 active 驱动 + userMenuConfig） */
export default async function MyMenuPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  // menus 表 active 菜单 + 全部分组 + 当前用户在当前账本已启用 menu_id（null = 全部启用）
  const [menus, groups, enabledIds] = await Promise.all([
    getActiveMenus(),
    getMenuGroupsForNav(),
    getLedgerMenuIds(ledger.id, user.id),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/profile"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← {d.profile.title}
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{d.profile.myMenu}</h1>
        </div>
      </div>
      <UserMenuEditor menus={menus} groups={groups} enabledIds={enabledIds} />
    </div>
  );
}
