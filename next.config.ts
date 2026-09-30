import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** ratcount · Next.js 16 配置（双部署模式）
 *  - server（默认）：Node 服务端渲染 + Auth.js + Vercel Cron
 *  - desktop      ：Electron 桌面应用；standalone 输出（output:'standalone'），主进程内以子进程启动本地 Node 服务读写 SQLite
 *  - 模式由 NEXT_PUBLIC_DEPLOY_MODE 决定（此处内联判定，避免 next.config 引入 '@/' 别名依赖）。
 */
const DEPLOY_MODE = (process.env.NEXT_PUBLIC_DEPLOY_MODE as string) || "server";
const isDesktopMode = DEPLOY_MODE === "desktop";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * 安全响应头（两种部署模式一致：桌面为 standalone 真实 Node 服务，同样由 headers() 注入）
 * Security headers (applied in both deploy modes: standalone desktop runs a real Node service, injected via headers() too).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // 注：Content-Security-Policy 已下放到 middleware.ts，按请求生成 nonce；
  // 这里仅保留其余安全头（CSP 在页面路由由中间件注入，API/静态资源无需 CSP）。
];

const nextConfig: NextConfig = {
  // 关闭 X-Powered-By: Next.js 版本指纹（P1-1）
  poweredByHeader: false,
  // 桌面模式：standalone 输出（Electron 主进程内以子进程启动本地 Node 服务）
  ...(isDesktopMode ? { output: "standalone", images: { unoptimized: true } } : {}),
  // 桌面同样运行真实 Node 服务，安全响应头两种模式一致
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
