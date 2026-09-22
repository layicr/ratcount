import { test, expect } from "@playwright/test";

// 注册旅程走「未登录」会话，覆盖 config 级 storageState（官方支持在 spec 内覆盖）
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("注册流程", () => {
  test("新用户注册 → 跳转登录 → 登录进入仪表盘", async ({ page }) => {
    const email = `e2e-${Date.now()}@test.local`;

    await page.goto("/register");
    await expect(page.locator('input[name="name"]')).toBeVisible();

    await page.locator('input[name="name"]').fill("E2E新用户");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("pass123456");
    await page.getByRole("button", { name: /注\s*册/ }).click();

    // 注册成功应重定向到登录页（注册动作内部 redirect("/login")）
    await page.waitForURL("**/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();

    // 用新账号真实登录，验证注册数据可用
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("pass123456");
    await page.getByRole("button", { name: /登\s*录/ }).click();

    await page.waitForURL("**/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
  });
});
