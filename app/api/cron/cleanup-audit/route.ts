import type { NextRequest } from "next/server";
import { purgeExpiredAuditLogs } from "@/lib/audit-cleanup";

/**
 * Vercel Cron 专用端点：每日清理超期审计日志。
 *  - 由 vercel.json 的 crons 以 GET 定时调用（schedule 为 UTC）。
 *  - 必须携带 Authorization: Bearer <CRON_SECRET> 才放行；Vercel 在配置了
 *    CRON_SECRET 环境变量后会自动附带该头。未配置 CRON_SECRET 时不强制校验，
 *    便于本地 dry-run，但生产部署务必设置 CRON_SECRET 以防端点被随意调用。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { days, deleted } = await purgeExpiredAuditLogs();
    return Response.json({ ok: true, days, deleted });
  } catch (e) {
    console.error("[audit-cleanup] Cron 清理失败 / Cron purge failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
