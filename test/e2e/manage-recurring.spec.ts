import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("周期计划管理页按钮", () => {
  const stamp = Date.now();
  const name = `E2E计划${stamp}`;

  test("着陆：显示标题与新建表单", async ({ page }) => {
    await page.goto("/recurring");
    await expect(page.locator("h1", { hasText: "周期计划" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增" })).toBeVisible();
  });

  test("新增周期计划：表单保存 + 确认框", async ({ page }) => {
    await page.goto("/recurring");
    // 新建表单默认隐藏，点击「新增」后以 creating 状态渲染（此时页面仅剩表单卡片）
    await page.getByRole("button", { name: "新增" }).click();
    const formBox = page.locator("div.rounded-2xl").first();
    // 左侧表单 input 顺序：name / amount / date / remark
    await formBox.locator("input").nth(0).fill(name);
    await formBox.locator("input").nth(1).fill("66.00");
    // 支出/收入类型保存前必须选择分类（校验链：name → amount → account → category）
    const catSel = formBox.locator("select").filter({
      has: page.locator("option", { hasText: "选择分类" }),
    });
    await catSel.selectOption({ index: 1 });
    await formBox.locator("input").nth(3).fill("E2E 计划备注");
    await formBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存计划" })).toBeVisible();
    await clickModalOk(page, "保存");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("E2E 计划备注")).toBeVisible();
  });

  test("执行本期：确认框 + 生成流水提示", async ({ page }) => {
    await page.goto("/recurring");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "执行本期" }).click();
    await expect(modal(page).getByRole("heading", { name: "执行本期" })).toBeVisible();
    await clickModalOk(page, "执行本期");
    await expect(page.getByText("已生成流水")).toBeVisible();
  });

  test("暂停计划：确认框 + 已暂停状态", async ({ page }) => {
    await page.goto("/recurring");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "暂停" }).click();
    await expect(modal(page).getByRole("heading", { name: "暂停计划" })).toBeVisible();
    await clickModalOk(page, "暂停");
    await expect(page.getByText("已暂停")).toBeVisible();
  });

  test("恢复计划：确认框 + 状态恢复", async ({ page }) => {
    await page.goto("/recurring");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "恢复" }).click();
    await expect(modal(page).getByRole("heading", { name: "恢复计划" })).toBeVisible();
    await clickModalOk(page, "恢复");
    await expect(page.getByText("已暂停")).toHaveCount(0);
  });

  test("删除周期计划：确认框 + 列表移除", async ({ page }) => {
    await page.goto("/recurring");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除计划" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });
});
