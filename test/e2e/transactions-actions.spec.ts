import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

/**
 * 流水页按钮操作（依赖 seed 的 2 条当月流水：工资入账 / 餐饮开销）
 * - 筛选 / 清空
 * - 行内复制 / 行内删除（确认框）
 * - 全选 + 批量删除（确认框）
 * - 导入按钮（跳转导入页）
 */
test.describe("流水页按钮", () => {
  test("着陆：筛选栏与操作按钮可见", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.locator("h1", { hasText: "流水" })).toBeVisible();
    await expect(page.getByRole("button", { name: "筛选" })).toBeVisible();
    await expect(page.getByRole("link", { name: "清空" })).toBeVisible();
    await expect(page.getByRole("link", { name: "导入数据" })).toBeVisible();
    await expect(page.getByRole("button", { name: /批量删除/ })).toBeVisible();
  });

  test("筛选：关键词命中 + 表格收缩", async ({ page }) => {
    await page.goto("/transactions");
    const total = await page.locator("tbody tr").count();
    expect(total).toBeGreaterThanOrEqual(2);
    await page.locator('input[name="q"]').fill("餐饮开销");
    await page.getByRole("button", { name: "筛选" }).click();
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByText("餐饮开销", { exact: true })).toBeVisible();
    await expect(page.getByText("工资入账", { exact: true })).toHaveCount(0);
  });

  test("清空：移除筛选参数并恢复全量", async ({ page }) => {
    // 先取全量行数（可能受其它 spec 执行本期新增流水影响，动态取值）
    await page.goto("/transactions");
    const total = await page.locator("tbody tr").count();
    expect(total).toBeGreaterThanOrEqual(2);
    await page.goto("/transactions?q=%E9%A4%90%E9%A5%AE%E5%BC%80%E9%94%80&type=expense");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("link", { name: "清空" }).click();
    await expect(page).not.toHaveURL(/[?&](q|type)=/);
    await expect(page.locator("tbody tr")).toHaveCount(total);
  });

  test("行内复制：确认框 + 提示 + 列表新增一行", async ({ page }) => {
    await page.goto("/transactions");
    const before = await page.locator("tbody tr").count();
    expect(before).toBeGreaterThan(0);
    await page.locator("tbody tr").first().getByRole("button", { name: "复制" }).click();
    await expect(modal(page).getByText("复制流水")).toBeVisible();
    await clickModalOk(page, "复制");
    await expect(page.getByText("已复制为新流水（日期为今天）")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(before + 1);
  });

  test("行内删除：确认框 + 列表减少一行", async ({ page }) => {
    await page.goto("/transactions");
    const before = await page.locator("tbody tr").count();
    expect(before).toBeGreaterThan(0);
    await page.locator("tbody tr").first().getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByText("删除流水")).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tbody tr")).toHaveCount(before - 1);
  });

  test("全选 + 批量删除：确认框 + 空态", async ({ page }) => {
    await page.goto("/transactions");
    const before = await page.locator("tbody tr").count();
    expect(before).toBeGreaterThan(0);
    // 批量操作栏全选 checkbox
    const selectAll = page.locator("label", { hasText: "全选" }).locator("input[type=checkbox]");
    await selectAll.check();
    await expect(page.getByRole("button", { name: `批量删除（${before}）` })).toBeVisible();
    await page.getByRole("button", { name: `批量删除（${before}）` }).click();
    await expect(modal(page).getByText("批量删除")).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.getByText("暂无数据")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });

  test("导入按钮：跳转导入数据页", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("link", { name: "导入数据" }).click();
    await page.waitForURL("**/import");
    await expect(page.locator("h1", { hasText: "导入数据" })).toBeVisible();
  });
});
