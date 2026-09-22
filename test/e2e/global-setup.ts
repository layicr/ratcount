import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";

/**
 * E2E 全局准备（在 webServer 启动前执行）：
 * 1. 按 schema 同步建表（drizzle-kit push，指向 E2E 库；无表则建表，已存在则无变更）
 * 2. 写入 E2E 种子数据（e2e/seed-e2e.ts，幂等：先清空相关表再重建，
 *    因此每次运行都从干净、可复现的数据状态开始，且不依赖删除库文件——
 *    Windows 下 libsql 的文件句柄会使 rmSync 偶发 EPERM）
 * 3. 删除残留的登录态 storageState（避免上一轮测试遗留的语言/会话 cookie 污染
 *    本轮用例，如历史 storageState 里 money_locale=zh-TW 导致简体断言失败）
 */
// 项目根：本文件位于 test/e2e/ 下，向上两级
const ROOT = resolve(__dirname, "../..");

const E2E_DB_URL = "file:./data/e2e-ratcount.db";
const E2E_SECRET = "e2e-ratcount-secret-2026-abcdef";

const ENV = {
  ...process.env,
  DATABASE_MODE: "file",
  DATABASE_URL: E2E_DB_URL,
  AUTH_SECRET: E2E_SECRET,
};

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd: string, args: string[], label: string) {
  // 注意：Windows 上 spawnSync 直接 spawn .cmd 会报 EINVAL，须走 shell:true
  const r = spawnSync(cmd, args, { shell: true, cwd: ROOT, env: ENV, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`[global-setup] ${label} 失败 (exit=${r.status}, error=${r.error})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
  return r;
}

export default async function globalSetup() {
  // —— 1. 建表（--force 跳过交互确认）——
  run(npxCmd, ["drizzle-kit", "push", "--force"], "建表 drizzle-kit push");

  // —— 2. 种子数据（幂等）——
  run(npxCmd, ["tsx", "test/e2e/seed-e2e.ts"], "E2E 种子写入");

  // —— 3. 清理残留登录态（防语言/会话 cookie 跨轮污染）——
  const authFile = resolve(ROOT, "test/e2e/.auth/user.json");
  if (existsSync(authFile)) rmSync(authFile, { force: true });

  // eslint-disable-next-line no-console
  console.log("[global-setup] E2E 数据库已就绪");
}
