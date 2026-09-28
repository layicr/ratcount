import { test, expect } from "@playwright/test";

// 登录相关用例全部走「未登录」会话，覆盖 config 级 storageState（与 register.spec 一致）
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("登录流程", () => {
  test("未登录访问受保护页 → 重定向到 /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("登录页：渲染应用名、邮箱/密码/登录按钮、注册入口", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /登\s*录/ })).toBeVisible();
    // seed 开放注册，登录页应有注册链接
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test("登录失败：错误密码提示错误信息且留在登录页", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@example.com");
    await page.locator('input[name="password"]').fill("wrong-password-123");
    await page.getByRole("button", { name: /登\s*录/ }).click();
    // 登录失败展示错误提示（login.error 文案），且仍在登录页
    await expect(page.locator("p.text-red-600")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("登录成功：合法凭据进入仪表盘", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@example.com");
    await page.locator('input[name="password"]').fill("demo1234");
    await page.getByRole("button", { name: /登\s*录/ }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
  });
});
