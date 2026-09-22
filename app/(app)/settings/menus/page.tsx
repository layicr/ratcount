import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, SETTINGS_PATH, SETTINGS_MENUS_PATH } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { listMenus } from "@/lib/queries";
import { getAllMenuGroups } from "@/app/actions/menu-groups";
import { getPaginationConfig, parsePage, resolvePageSize } from "@/lib/pagination";
import { MenuManager } from "./menu-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 菜单管理（仅管理员）：全局导航菜单的增删改查，支持搜索 + 分页 */
export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; device?: string; status?: string; pageSize?: string }>;
}) {
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

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = (sp.q ?? "").trim();
  const device = (sp.device ?? "").trim();
  const status = (sp.status ?? "").trim();
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();
  const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);

  const [menuResult, groups] = await Promise.all([
    listMenus({ search: q, device: device || undefined, status: status || undefined, page, pageSize }),
    getAllMenuGroups(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={SETTINGS_PATH} className="text-sm text-slate-500 hover:text-teal-600">
          ← {d.nav.settings}
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{d.menuMgmt.title}</h1>
        </div>
      </div>
      <MenuManager
        menus={menuResult.rows}
        groups={groups}
        page={page}
        totalPages={menuResult.totalPages}
        total={menuResult.total}
        q={q}
        device={device}
        status={status}
        pageSize={pageSize}
        basePath={SETTINGS_MENUS_PATH}
        allowedPageSizes={allowedPageSizes}
      />
    </div>
  );
}
