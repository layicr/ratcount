import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, SETTINGS_PATH, SETTINGS_LOGS_PATH } from "@/lib/constants";
import { getPaginationConfig, parsePage, resolvePageSize } from "@/lib/pagination";
import { listAuditLogs } from "@/lib/queries";
import { LogsManager } from "./logs-manager";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 操作日志（合并原 /logs）：写操作留痕（C/U/D）+ 分页 + 搜索 + 批量删除 + 清理；仅管理员可访问（全局设置下） */
export default async function SettingsLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const user = await requireUser();
  const d = (await getMessages()) as unknown as AppDict;
  const ACTION_LABELS: Record<string, string> = { C: d.common.add, R: d.common.view, U: d.common.edit, D: d.common.delete };

  // 仅管理员可访问全局设置下的操作日志 / Admin only
  if (user.role !== ROLE.admin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
      </div>
    );
  }

  // 从全局设置读取分页配置
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();

  // Next.js 16: searchParams 是 Promise，必须 await
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = (sp.q ?? "").trim();
  // 每页条数：只接受全局设置中允许的值，否则用默认值
  const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);

  const { rows: data, total, totalPages } = await listAuditLogs({
    userId: undefined,
    search: q,
    page,
    pageSize,
  });

  return (
    <div className="space-y-4">
      {/* 标题行：返回全局设置 + 页面标题 */}
      <div className="flex items-center gap-3">
        <Link href={SETTINGS_PATH} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600">
          <span>←</span>
          <span>{d.settings.title}</span>
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{d.logs.title}</h1>
      </div>
      <LogsManager
        logs={data}
        isAdmin={user.role === ROLE.admin}
        actionLabels={ACTION_LABELS}
        page={page}
        totalPages={totalPages}
        total={total}
        q={q}
        pageSize={pageSize}
        basePath={SETTINGS_LOGS_PATH}
        allowedPageSizes={allowedPageSizes}
      />
    </div>
  );
}
