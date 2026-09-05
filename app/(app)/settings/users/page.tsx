import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { getPaginationConfig } from "@/lib/pagination";
import { listUsers, countUsers } from "@/app/actions/users";
import { UsersManager } from "./users-manager";

/** 用户管理页面（仅管理员）：用户列表 + 增加/编辑/删除/搜索 + 分页 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) redirect("/login");
  const d = getDictionary(await getLocale());

  // 仅管理员可访问 / Admin only
  if (user.role !== "admin") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
      </div>
    );
  }

  // 从全局设置读取分页配置
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();

  const params = await searchParams;
  const search = params.q ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = allowedPageSizes.includes(parseInt(params.pageSize ?? "", 10))
    ? parseInt(params.pageSize!, 10)
    : defaultPageSize;

  const [users, total] = await Promise.all([
    listUsers(search, page, pageSize),
    countUsers(search),
  ]);

  return (
    <div className="space-y-4">
      {/* 标题行：返回链接 + 页面标题 / Title row: back link + page title */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600">
          <span>←</span>
          <span>{d.settings.title}</span>
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{d.userMgmt.title}</h1>
      </div>
      <UsersManager
        initialUsers={users}
        initialSearch={search}
        currentUserId={user.id}
        total={total}
        page={page}
        pageSize={pageSize}
        allowedPageSizes={allowedPageSizes}
      />
    </div>
  );
}
