import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** ratcount · Next.js 16 配置（双部署模式）
 *  - server（默认）：Node 服务端渲染 + Auth.js + Vercel Cron
 *  - desktop      ：Electron 桌面应用；渲染端静态导出（output:'export'），主进程经 IPC 读写本地/云端 SQLite
 *  - 模式由 NEXT_PUBLIC_DEPLOY_MODE 决定（此处内联判定，避免 next.config 引入 '@/' 别名依赖）。
 */
const DEPLOY_MODE = (process.env.NEXT_PUBLIC_DEPLOY_MODE as string) || "server";
const isDesktopMode = DEPLOY_MODE === "desktop";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** 生产环境标记：CSP 的严格版本只在生产启用（开发需 unsafe-eval 支持 HMR/调试） */
const isProd = process.env.NODE_ENV === "production";

/**
 * 安全响应头（仅服务端模式注入；静态导出无法在构建期套用响应头，由桌面外壳/托管层负责）
 * Security headers (server mode only; static export can't apply them at build time).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isProd
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // 桌面模式：standalone 输出（Electron 主进程内以子进程启动本地 Node 服务）
  ...(isDesktopMode ? { output: "standalone", images: { unoptimized: true } } : {}),
  // 桌面同样运行真实 Node 服务，安全响应头两种模式一致
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
