// ratcount · 部署模式开关（单一事实来源）/ Deploy-mode switch (single source of truth)
//  - server（默认）：Next.js + Node 服务端形态（Turso/本地 SQLite + Auth.js + Vercel Cron）
//  - desktop      ：Electron 桌面应用（主进程 file: SQLite 落「安装目录/data/」；渲染端静态导出 + IPC）
//
// 所有「双模式分支」都以本文件的 isDesktopMode / isServerMode 为准，默认值 server，
// 保证现有 Vercel/Node 部署零回归。
// Every dual-mode branch keys off isDesktopMode / isServerMode here; default is server,
// so the existing Vercel/Node deployment is never affected.
import { DEPLOY_MODE_SERVER, DEPLOY_MODE_DESKTOP, type DeployMode } from "./runtime-types";

// 渲染端（浏览器/静态导出）在构建时内联 NEXT_PUBLIC_ 变量；主进程/服务端直接读取同一变量。
// Renderer inlines NEXT_PUBLIC_ at build time; main process / server read the same var directly.
export const DEPLOY_MODE: DeployMode =
  (process.env.NEXT_PUBLIC_DEPLOY_MODE as DeployMode) || DEPLOY_MODE_SERVER;

/** 是否桌面模式（Electron）/ Whether running as the Electron desktop app */
export const isDesktopMode: boolean = DEPLOY_MODE === DEPLOY_MODE_DESKTOP;

/** 是否服务端模式（Next.js + Node，默认）/ Whether running as the Next.js + Node server (default) */
export const isServerMode: boolean = DEPLOY_MODE === DEPLOY_MODE_SERVER;
