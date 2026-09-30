import type { NextRequest } from "next/server";
import { purgeExpiredAuditLogs } from "@/lib/audit-cleanup";

/**
 * Vercel Cron 专用端点：每日清理超期审计日志。
 *  - 由 vercel.json 的 crons 以 GET 定时调用（schedule 为 UTC）。
 *  - 必须携带 Authorization: Bearer <CRON_SECRET> 才放行；Vercel 在配置了
 *    CRON_SECRET 环境变量后会自动附带该头。
 *  - 生产环境（NODE_ENV=production）强制要求 CRON_SECRET，缺失即 401，杜绝端点被随意调用；
 *    非生产（dev/test）未设置时允许本地 dry-run。任意环境只要设置了 CRON_SECRET 都必须校验 Bearer。
 */
export const runtime = "nodejs"; // Node 运行时（审计清理需服务端 API）/ Node runtime
export const dynamic = "force-dynamic"; // 始终动态渲染，避免被静态缓存/ Always dynamic (never statically cached)

// Cron 入口：清理超期审计日志（鉴权规则见文件头注释）/ Cron entry: purge expired audit logs (auth rules in header)
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // 生产：CRON_SECRET 必设且 Bearer 必匹配，否则一律拒绝。
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 非生产：设置了 CRON_SECRET 时同样要求正确 Bearer。
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { days, deleted } = await purgeExpiredAuditLogs();
    return Response.json({ ok: true, days, deleted });
  } catch (e) {
    // 详细异常仅留服务端日志，不回显给调用方（防内部信息泄露）。
    console.error("[audit-cleanup] Cron 清理失败 / Cron purge failed", e);
    return Response.json({ ok: false, error: "errors.internal" }, { status: 500 });
  }
}
