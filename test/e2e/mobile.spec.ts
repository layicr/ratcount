import { test, expect, type Page } from "@playwright/test";

/**
 * 移动端 E2E（playwright mobile-chromium project：Pixel 7 视口 + 触控 + isMobile）
 * 覆盖移动端三块：
 * - 响应式布局：移动视口下侧边栏隐藏/底部 tab 显示/无水平溢出；切桌面宽度布局切换
 * - 移动导航：底部 tab 跳转（流水/报表/我的）、FAB 记一笔
 * - 触控交互：移动端记一笔支出、账本切换（确认框按钮触控点击）
 * 运行：npm run test:e2e（mobile-chromium project）
 */
test.describe.configure({ mode: "serial" });

/** 移动端底部 tab bar（AppShell 中 nav.fixed.bottom-0，lg:hidden） */
const mobileNav = (page: Page) => page.locator("nav.fixed.bottom-0");
/** 确认框容器（ConfirmButton 弹窗） */
const modal = (page: Page) => page.locator("div.fixed.inset-0");

test.describe("移动端：响应式布局", () => {
  test("移动视口下侧边栏隐藏、底部 tab 可见、页面无水平溢出", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();

    // 侧边栏（aside hidden lg:flex）在 <lg 视口不可见
    await expect(page.locator("aside")).toBeHidden();
    // 底部 tab bar（lg:hidden）在移动视口可见
    await expect(mobileNav(page)).toBeVisible();

    // 无水平溢出：文档滚动宽度不超过视口宽度
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("切到桌面宽度时侧边栏恢复、底部 tab 隐藏", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
    await expect(mobileNav(page)).toBeHidden();
  });
});

test.describe("移动端：底部 tab 导航", () => {
  test("底部 tab 可跳转流水/报表/我的", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = mobileNav(page);

    // 流水
    await nav.getByRole("link", { name: /流\s*水/ }).click();
    await page.waitForURL("**/transactions");
    await expect(page.locator("h1", { hasText: "流水" })).toBeVisible();

    // 报表
    await nav.getByRole("link", { name: /报\s*表/ }).click();
    await page.waitForURL("**/reports");
    await expect(page.locator("h1", { hasText: "报表" })).toBeVisible();

    // 我的
    await nav.getByRole("link", { name: /我\s*的/ }).click();
    await page.waitForURL("**/profile");
    await expect(page.locator("h1", { hasText: "我的" })).toBeVisible();
  });

  test("FAB 记一笔跳转 /add", async ({ page }) => {
    await page.goto("/dashboard");
    await mobileNav(page).getByRole("link", { name: /记\s*一\s*笔/ }).click();
    await page.waitForURL("**/add");
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
  });

  test("底部 tab 完整：仪表盘/记一笔/流水/报表/我的（DB 驱动）", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = mobileNav(page);
    await expect(nav.getByRole("link", { name: /仪\s*表\s*盘/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /记\s*一\s*笔/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /流\s*水/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /报\s*表/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /我\s*的/ })).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(5);
  });

  test("底部 tab 激活态随路由切换", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = mobileNav(page);
    // 初始：仪表盘 tab 激活
    await expect(nav.getByRole("link", { name: /仪\s*表\s*盘/ })).toHaveClass(/text-teal-600/);
    await expect(nav.getByRole("link", { name: /流\s*水/ })).toHaveClass(/text-slate-500/);
    // 跳到流水：激活态转移
    await nav.getByRole("link", { name: /流\s*水/ }).click();
    await page.waitForURL("**/transactions");
    await expect(nav.getByRole("link", { name: /流\s*水/ })).toHaveClass(/text-teal-600/);
    await expect(nav.getByRole("link", { name: /仪\s*表\s*盘/ })).toHaveClass(/text-slate-500/);
  });
});

test.describe("移动端：触控交互", () => {
  test("触控记一笔支出", async ({ page }) => {
    const remark = `移动端支出-${Date.now()}`;
    await page.goto("/add");
    await expect(page.getByPlaceholder("0.00")).toBeVisible();

    await page.getByPlaceholder("0.00").fill("66.00");
    // 账户下拉按 label「账户」定位：0=请选择, 1=工资卡, 2=现金 → 支出选现金
    const acctBox = page
      .locator("div")
      .filter({ has: page.locator("label").filter({ hasText: "账户" }) })
      .last();
    const acctIdx = (
      await acctBox.locator("select option").allTextContents()
    ).findIndex((t) => t.includes("现金"));
    await acctBox.locator("select").selectOption({ index: acctIdx });
    // 分类：支出分类「餐饮」
    await page.getByRole("button", { name: /餐饮/ }).click();
    await page.getByPlaceholder("记点什么…").fill(remark);

    // 保存 → 确认框 → 确认（按钮限定在弹窗内）
    await page.getByRole("button", { name: /保\s*存/ }).click();
    await expect(page.getByText("保存流水")).toBeVisible();
    await modal(page).getByRole("button", { name: "保存", exact: true }).click();

    await page.waitForURL("**/transactions");
    await expect(page.getByText(remark, { exact: true })).toBeVisible();
  });

  test("触控账本切换", async ({ page }) => {
    await page.goto("/dashboard");
    const ledgerSelect = page.locator("header select").first();
    await expect(ledgerSelect).toBeVisible();

    // 顶栏切换到第二个账本（seed 固定顺序：0=E2E演示账本，1=出差账本）
    await ledgerSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: "确认" }).click();

    await page.waitForURL("**/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
    await expect(ledgerSelect.locator("option:checked")).toContainText("出差账本");
  });
});
