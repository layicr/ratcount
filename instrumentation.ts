/**
 * Next.js 启动钩子（仅 nodejs 运行时生效）
 *
 * 审计日志每日清理的两种运行模式，按部署环境自动选择：
 *  - Vercel（VERCEL=1）：无状态函数里 setInterval 无意义，清理交由 Vercel Cron
 *    定时触发 /api/cron/cleanup-audit（见 vercel.json）；本钩子不启动定时器。
 *  - 自托管 / 本地（默认）：进程内 setInterval 每日定时清理。
 * 可用环境变量强制覆盖：AUDIT_CLEANUP_MODE=cron | local。
 *
 * 桌面模式（NEXT_PUBLIC_DEPLOY_MODE=desktop）：本地 .db 无迁移文件，此处额外幂等建表。
 */
export async function register() {
  // standalone 服务（桌面 Electron 以子进程启动）不会注入 NEXT_RUNTIME，
  // 因此仅当「明确是非 nodejs 运行时」时才跳过；undefined 与 nodejs 都继续执行。
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime && runtime !== "nodejs") return;

  // 桌面模式：本地 .db 无迁移文件，服务启动时幂等建全部 21 张表（见 lib/db/bootstrap.ts）
  const { isDesktopMode } = await import("@/lib/runtime");
  if (isDesktopMode) {
    const { ensureSchema } = await import("@/lib/db/bootstrap");
    await ensureSchema();
  }

  const { startAuditCleanup } = await import("@/lib/audit-cleanup");

  const forced = process.env.AUDIT_CLEANUP_MODE;
  const useVercelCron =
    forced === "cron" ? true : forced === "local" ? false : process.env.VERCEL === "1";

  startAuditCleanup({ useVercelCron });
}
