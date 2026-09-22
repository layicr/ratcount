import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("个人中心", () => {
  test("个人中心：页面渲染与入口", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("h1", { hasText: "我的" }).first()).toBeVisible();
    await expect(page.getByText("风格设置")).toBeVisible();
    await expect(page.getByText("语言设置")).toBeVisible();
    await expect(page.getByRole("link", { name: "我的菜单" })).toBeVisible();
    await expect(page.getByRole("link", { name: "修改密码" })).toBeVisible();
  });

  test("风格设置：切换主题", async ({ page }) => {
    await page.goto("/profile");
    const forest = page.getByRole("button", { name: "森林绿" });
    await expect(forest).toBeVisible();
    await forest.click();
    await expect(page.getByText("主题已切换")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("theme-forest")), {
        timeout: 5000,
      })
      .toBe(true);
    // 切回浅色，避免影响其他用例视觉状态
    await page.getByRole("button", { name: "浅色" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("theme-forest")), {
        timeout: 5000,
      })
      .toBe(false);
  });

  test("语言设置：切换为英文再切回中文", async ({ page }) => {
    await page.goto("/profile");
    const enBtn = page.getByRole("button", { name: "English" });
    await expect(enBtn).toBeVisible();
    await enBtn.click();
    await expect
      .poll(
        async () => {
          const cookies = await page.context().cookies();
          return cookies.find((c) => c.name === "money_locale")?.value;
        },
        { timeout: 5000 },
      )
      .toBe("en");
    // 切回中文，保持后续用例为中文界面（applyLang 已整页 reload，当前页已是英文版 /profile）
    const zhBtn = page.getByRole("button", { name: /中文/ }).filter({ hasNotText: "繁體" });
    await expect(zhBtn).toBeVisible();
    await zhBtn.click();
    await expect
      .poll(
        async () => {
          const cookies = await page.context().cookies();
          return cookies.find((c) => c.name === "money_locale")?.value;
        },
        { timeout: 5000 },
      )
      .toBe("zh-CN");
  });

  test("我的菜单：勾选保存", async ({ page }) => {
    await page.goto("/profile/menu");
    await expect(page.locator("h1", { hasText: "我的菜单" })).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复默认" })).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "我的菜单" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText("菜单已保存")).toBeVisible();
  });

  test("昵称编辑：保存生效并改回原名", async ({ page }) => {
    await page.goto("/profile");
    const infoCard = page.locator("div.rounded-2xl", { hasText: "个人信息" }).first();
    const nameBox = infoCard.locator("div.rounded-lg", { hasText: "昵称" });
    const newName = `E2E昵称${Date.now()}`;

    await nameBox.getByRole("button", { name: "修改" }).click();
    await nameBox.locator("input").fill(newName);
    await nameBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存昵称" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText("昵称已保存")).toBeVisible();
    await expect(nameBox.getByText(newName, { exact: true })).toBeVisible();

    // 改回 seed 原名，避免影响其他用例
    await nameBox.getByRole("button", { name: "修改" }).click();
    await nameBox.locator("input").fill("E2E管理员");
    await nameBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存昵称" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText("昵称已保存")).toBeVisible();
  });

  test("个人宣言编辑：保存并生效", async ({ page }) => {
    await page.goto("/profile");
    const infoCard = page.locator("div.rounded-2xl", { hasText: "个人信息" }).first();
    const bioBox = infoCard.locator("div.rounded-lg", { hasText: "个人宣言" });
    const bioText = `E2E宣言${Date.now()}`;

    await bioBox.getByRole("button", { name: "修改" }).click();
    await bioBox.locator("textarea").fill(bioText);
    await bioBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存个人宣言" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText("个人宣言已保存")).toBeVisible();
    await expect(bioBox.getByText(bioText, { exact: true })).toBeVisible();
  });

  test("修改密码：旧密码错误被拦截", async ({ page }) => {
    await page.goto("/profile/password");
    await expect(page.locator("h1", { hasText: "修改密码" }).first()).toBeVisible();
    await page.locator("input").nth(0).fill("wrong-password");
    await page.locator("input").nth(1).fill("Newpass123");
    await page.locator("input").nth(2).fill("Newpass123");
    await page.getByRole("button", { name: "确认修改", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "确认修改密码" })).toBeVisible();
    await clickModalOk(page, "确认修改");
    await expect(page.getByText("旧密码错误")).toBeVisible();
  });
});
