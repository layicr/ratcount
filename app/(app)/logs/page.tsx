import { requireUser } from "@/lib/scope";
import { getLocale, getDictionary } from "@/lib/i18n";
import { getPaginationConfig, parsePage, resolvePageSize } from "@/lib/pagination";
import { listAuditLogs } from "@/lib/queries";
import { LogsManager } from "./logs-manager";

/** 操作日志：写操作留痕（C/U/D）+ 分页 + 搜索 + 批量删除 + 清理；按用户维度隔离 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const user = await requireUser();
  const d = getDictionary(await getLocale());
  const ACTION_LABELS: Record<string, string> = { C: d.logs.actionC, R: d.logs.actionR, U: d.logs.actionU, D: d.logs.actionD };

  // 从全局设置读取分页配置
  const { allowedPageSizes, defaultPageSize } = await getPaginationConfig();

  // Next.js 16: searchParams 是 Promise，必须 await
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = (sp.q ?? "").trim();
  // 每页条数：只接受全局设置中允许的值，否则用默认值
  const pageSize = resolvePageSize(sp.pageSize, allowedPageSizes, defaultPageSize);

  const { rows: data, total, totalPages } = await listAuditLogs({
    userId: user.role === "admin" ? undefined : user.id,
    search: q,
    page,
    pageSize,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">{d.logs.title}</h1>
        {user.role !== "admin" && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{d.logs.adminOnly}</span>
        )}
      </div>
      <LogsManager
        logs={data}
        isAdmin={user.role === "admin"}
        actionLabels={ACTION_LABELS}
        page={page}
        totalPages={totalPages}
        total={total}
        q={q}
        pageSize={pageSize}
        allowedPageSizes={allowedPageSizes}
      />
    </div>
  );
}
