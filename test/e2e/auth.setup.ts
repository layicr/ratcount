import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";

/**
 * 登录旅程 E2E：以 seed 用户通过真实 UI 登录，
 * 并将登录态封存到 storageState，供业务用例复用（Playwright 官方认证模式）。
 */
const authFile = "test/e2e/.auth/user.json";

setup("UI 登录并封存会话", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[name="email"]')).toBeVisible();

  await page.locator('input[name="email"]').fill("admin@example.com");
  await page.locator('input[name="password"]').fill("demo1234");
  await page.getByRole("button", { name: /登\s*录/ }).click();

  // 登录成功进入仪表盘
  await page.waitForURL("**/dashboard");
  await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();

  // 封存会话
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
