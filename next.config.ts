import type { NextConfig } from "next";

/** ratcount · Next.js 16 配置
 *  - output 默认（Node 服务端渲染）；本地/云端均适用
 *  - Turbopack 由 scripts.dev 的 --turbopack 启用
 */
const nextConfig: NextConfig = {
  /* 如需国际化路由前缀可在此开启（当前采用轻量字典 i18n，见 lib/i18n.ts） */
};

export default nextConfig;
