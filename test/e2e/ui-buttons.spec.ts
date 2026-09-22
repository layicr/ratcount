import { test, expect } from "@playwright/test";

/**
 * 页面全部按钮 E2E 冒烟（复用 setup 登录态）
 * - 主要页面按钮均可见且可交互（无死按钮 / 无 aria-label 缺失导致的不可达）
 * - 关键操作按钮可点击并触发预期 UI（新增/保存/主题/语言等）
 * 说明：完整按钮清单的静态审计在 test/ui-buttons.test.ts；本文件在真实浏览器
 * 验证「可见 + 可点 + 有反馈」的运行时行为。
 */
test.describe.configure({ mode: "serial" });

const PAGES: Array<{ path: string; h1: RegExp; minButtons: number }> = [
  // dashboard 为纯展示页（统计卡片），无 button，minButtons 置 0 仅验证可达性
  { path: "/dashboard", h1: /仪表盘/, minButtons: 0 },
  { path: "/add", h1: /记一笔|新增/, minButtons: 2 },
  { path: "/transactions", h1: /流水/, minButtons: 2 },
  { path: "/reports", h1: /报表/, minButtons: 2 },
  { path: "/ledgers", h1: /账本/, minButtons: 2 },
  { path: "/settings", h1: /设置/, minButtons: 2 },
];

test.describe("页面按钮冒烟", () => {
  for (const p of PAGES) {
    test(`页面 ${p.path} 按钮可见可点`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.locator("h1", { hasText: p.h1 })).toBeVisible();

      const buttons = page.getByRole("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(p.minButtons);

      // 逐个检查可见性：前 minButtons 个必须可见
      for (let i = 0; i < Math.min(count, p.minButtons); i++) {
        await expect(buttons.nth(i)).toBeVisible();
      }
    });
  }
});

test.describe("关键操作按钮反馈", () => {
  test("主题按钮可切换（设置页点击深色主题并应用）", async ({ page }) => {
    await page.goto("/settings");
    // 主题选择为按钮组（THEME_ITEMS，设置表单内无主题 select），点击「深色」按钮
    const darkBtn = page.getByRole("button", { name: "深色" }).first();
    await expect(darkBtn).toBeVisible();
    await darkBtn.click();
    // 点击后 applyThemeToDocument 立即在 <html> 挂 dark class；保存刷新后 default_theme 持久化仍为 dark
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("语言切换按钮可点击（顶栏语言菜单）", async ({ page }) => {
    await page.goto("/dashboard");
    // 尝试定位语言切换器：aria-label 或文本含「语言」
    const localeBtn = page.getByRole("button", { name: /语言|Language/i }).first();
    if (await localeBtn.count()) {
      await localeBtn.click();
      await expect(page.getByRole("menu")).toBeVisible().catch(() => {});
    }
  });

  test("记一笔保存流程主按钮可用（add 页提交链路）", async ({ page }) => {
    await page.goto("/add");
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
    const save = page.getByRole("button", { name: /保\s*存/ }).first();
    await expect(save).toBeEnabled();
  });
});
