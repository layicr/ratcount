import { defineConfig, devices } from "@playwright/test";

/**
 * RatCount 端到端测试配置
 *
 * - 使用独立 SQLite 库（data/e2e-ratcount.db），与开发库 data/ratcount.db 完全隔离
 * - webServer 以 `npm run dev` 启动真实 Next.js 服务（localhost:3200），复用项目既有启动方式
 * - E2E 库结构由 `drizzle-kit push` 按 schema 同步，种子数据由 e2e/seed-e2e.ts 写入
 * - setup project 完成真实 UI 登录并封存会话（storageState），业务用例复用登录态
 *
 * 运行：npm run test:e2e
 */
const E2E_DB = "file:./data/e2e-ratcount.db";
const E2E_SECRET = "e2e-ratcount-secret-2026-abcdef";

export default defineConfig({
  // Playwright 的 testDir 仅支持字符串；测试文件统一存放 test/e2e/ 目录
  testDir: ".",
  testMatch: /test[\\/]e2e[\\/].*\.spec\.ts/,
  globalSetup: "./test/e2e/global-setup.ts",
  // 用例共享同一 E2E 库与登录态，必须串行
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3200",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // 登录旅程：真实 UI 登录 seed 用户，并保存会话供业务用例复用
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /mobile\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "test/e2e/.auth/user.json",
      },
    },
    // 移动端（触控 + 移动视口）：响应式布局 / 底部 tab 导航 / 触控交互
    {
      name: "mobile-chromium",
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        storageState: "test/e2e/.auth/user.json",
      },
    },
  ],
  webServer: {
    command: "npx next start --port 3200",
    url: "http://localhost:3200",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_MODE: "file",
      DATABASE_URL: E2E_DB,
      AUTH_SECRET: E2E_SECRET,
    },
  },
});
