import { test, expect, type Page } from "@playwright/test";

/** 确认框容器（ConfirmButton 弹窗） */
const modal = (page: Page) => page.locator("div.fixed.inset-0");

/**
 * 核心用户旅程 E2E（复用 setup 登录态，严格串行）
 * - 仪表盘着陆
 * - 记一笔支出 / 记一笔收入（表单 + 保存确认框 + 流水列表断言）
 * - 账本切换（顶栏下拉 + 确认框）
 * - 报表页渲染（页签 + ECharts 画布）
 */
test.describe.configure({ mode: "serial" });

test.describe("核心用户旅程", () => {
  const remarkExpense = `E2E支出-${Date.now()}`;
  const remarkIncome = `E2E收入-${Date.now()}`;

  test("仪表盘着陆", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
  });

  test("记一笔支出", async ({ page }) => {
    await page.goto("/add");
    await expect(page.getByPlaceholder("0.00")).toBeVisible();

    await page.getByPlaceholder("0.00").fill("88.50");
    // add 表单内的「账户」下拉：按 label「账户」定位（顶栏账本/语言切换器等 select 不得参与 nth 计数）
    // option 顺序（快照实测）：0=请选择, 1=工资卡, 2=现金 → 支出选现金(2)
    const acctBox = page
      .locator("div")
      .filter({ has: page.locator("label").filter({ hasText: "账户" }) })
      .last();
    // option 文本定位，避免账户数量/顺序变化（seed 含现金、工资卡、基金账户）
    const acctIdx = (
      await acctBox.locator("select option").allTextContents()
    ).findIndex((t) => t.includes("现金"));
    await acctBox.locator("select").selectOption({ index: acctIdx });
    // 分类：支出分类「餐饮」
    await page.getByRole("button", { name: /餐饮/ }).click();
    // 备注作为唯一标识
    await page.getByPlaceholder("记点什么…").fill(remarkExpense);

    // 保存 → 弹确认框（标题「保存流水」；弹窗确认按钮文本为「保存」，与表单按钮「保 存」区分）
    await page.getByRole("button", { name: /保\s*存/ }).click();
    await expect(page.getByText("保存流水")).toBeVisible();
    // 确认按钮限定在弹窗内：外层表单按钮也是「保存」，避免 strict mode 双匹配
    await modal(page).getByRole("button", { name: "保存", exact: true }).click();

    // 成功跳回流水页，列表中可见该笔
    await page.waitForURL("**/transactions");
    await expect(page.getByText(remarkExpense, { exact: true })).toBeVisible();
  });

  test("记一笔收入", async ({ page }) => {
    await page.goto("/add");
    await expect(page.getByPlaceholder("0.00")).toBeVisible();

    // 切到收入 tab
    await page.getByRole("button", { name: /收\s*入/ }).click();
    await page.getByPlaceholder("0.00").fill("168.00");
    // 账户下拉按 label「账户」定位（顶栏语言切换器不参与 nth 计数）：0=请选择,1=工资卡,2=现金 → 收入选工资卡(1)
    const acctBox = page
      .locator("div")
      .filter({ has: page.locator("label").filter({ hasText: "账户" }) })
      .last();
    // option 文本定位（收入走工资卡）
    const acctIdx = (
      await acctBox.locator("select option").allTextContents()
    ).findIndex((t) => t.includes("工资卡"));
    await acctBox.locator("select").selectOption({ index: acctIdx });
    await page.getByRole("button", { name: /工资/ }).click();
    await page.getByPlaceholder("记点什么…").fill(remarkIncome);

    await page.getByRole("button", { name: /保\s*存/ }).click();
    await expect(page.getByText("保存流水")).toBeVisible();
    // 确认按钮限定在弹窗内（外层表单按钮也是「保存」）
    await modal(page).getByRole("button", { name: "保存", exact: true }).click();

    await page.waitForURL("**/transactions");
    await expect(page.getByText(remarkIncome, { exact: true })).toBeVisible();
  });

  test("仪表盘统计更新", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
    await expect(page.getByText("本月收入")).toBeVisible();
    await expect(page.getByText("本月支出")).toBeVisible();
  });

  test("账本切换", async ({ page }) => {
    await page.goto("/dashboard");
    const ledgerSelect = page.locator("header select").first();
    await expect(ledgerSelect).toBeVisible();

    // 顶栏切换到第二个账本（seed 固定顺序：0=E2E演示账本，1=出差账本）
    await ledgerSelect.selectOption({ index: 1 });
    // 弹确认框后点「确认」
    await page.getByRole("button", { name: "确认" }).click();

    // 切换成功：整页刷新回仪表盘，且顶栏当前选中为「出差账本」
    await page.waitForURL("**/dashboard");
    await expect(page.locator("h1", { hasText: "仪表盘" })).toBeVisible();
    await expect(ledgerSelect.locator("option:checked")).toContainText("出差账本");
  });

  test("报表页渲染", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("h1", { hasText: "报表" })).toBeVisible();

    // 6 个报表页签
    for (const tab of ["总览", "分类", "趋势", "项目", "标签", "资产"]) {
      await expect(page.getByRole("link", { name: tab, exact: true })).toBeVisible();
    }

    // 默认总览页含趋势图（ECharts canvas）
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
  });
});
