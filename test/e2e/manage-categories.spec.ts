import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("分类管理页按钮", () => {
  const stamp = Date.now();
  const name = `E2E分类${stamp}`;
  const edited = `E2E分类改${stamp}`;

  test("着陆：Tab 切换与新增按钮", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.locator("h1", { hasText: "分类管理" })).toBeVisible();
    await expect(page.getByRole("button", { name: "支出分类" })).toBeVisible();
    await expect(page.getByRole("button", { name: "收入分类" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增" })).toBeVisible();
  });

  test("新增分类（支出 Tab）：表单保存 + 确认框", async ({ page }) => {
    await page.goto("/categories");
    await page.getByRole("button", { name: "新增" }).click();
    const formBox = page.locator("div.rounded-2xl.border-teal-200");
    await formBox.locator("input").nth(0).fill(name);
    await formBox.locator("input").nth(1).fill("E2E 分类备注");
    await formBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "新增分类" })).toBeVisible();
    await clickModalOk(page, "保存");
    const card = page.locator("div.rounded-2xl.border-slate-200", { hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("E2E 分类备注")).toBeVisible();
  });

  test("编辑分类：改名 + 确认框", async ({ page }) => {
    await page.goto("/categories");
    const card = page.locator("div.rounded-2xl.border-slate-200", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "修改" }).click();
    const formBox = page.locator("div.rounded-2xl.border-teal-200");
    await formBox.locator("input").nth(0).fill(edited);
    await formBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存分类" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test("删除分类：确认框 + 列表移除", async ({ page }) => {
    await page.goto("/categories");
    const card = page.locator("div.rounded-2xl.border-slate-200", { hasText: edited });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除分类" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  });
});
