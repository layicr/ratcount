// ratcount · 部署模式常量与类型 / Deploy-mode constants & types (kept tiny to avoid import cycles)
// 模式值集中为常量，避免各处分散字面量字符串。
export const DEPLOY_MODE_SERVER = "server" as const; // Next.js + Node 服务端形态（默认）
export const DEPLOY_MODE_DESKTOP = "desktop" as const; // Electron 桌面应用

export type DeployMode = typeof DEPLOY_MODE_SERVER | typeof DEPLOY_MODE_DESKTOP;
