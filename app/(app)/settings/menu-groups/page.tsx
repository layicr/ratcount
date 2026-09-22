import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, SETTINGS_PATH } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { getAllMenuGroups } from "@/app/actions/menu-groups";
import { MenuGroupManager } from "./menu-group-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 菜单分组管理（仅管理员）：全局导航分组的增删改查 */
export default async function MenuGroupsPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  if (user.role !== ROLE.admin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
        <Link href={SETTINGS_PATH} className="mt-3 inline-block text-sm text-teal-600 hover:underline">
          ← {d.nav.settings}
        </Link>
      </div>
    );
  }

  const groups = await getAllMenuGroups();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={SETTINGS_PATH} className="text-sm text-slate-500 hover:text-teal-600">
          ← {d.nav.settings}
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{d.menuMgmt.groupTitle}</h1>
        </div>
      </div>
      <MenuGroupManager groups={groups} />
    </div>
  );
}
