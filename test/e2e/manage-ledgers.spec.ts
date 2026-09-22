import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("账本管理页按钮", () => {
  const stamp = Date.now();
  const name = `E2E账本${stamp}`;
  const edited = `E2E账本改${stamp}`;

  test("着陆：显示标题与新增按钮", async ({ page }) => {
    await page.goto("/ledgers");
    await expect(page.locator("h1", { hasText: "账本管理" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增" })).toBeVisible();
  });

  test("新增账本：表单保存 + 确认框", async ({ page }) => {
    await page.goto("/ledgers");
    await page.getByRole("button", { name: "新增" }).click();
    const form = page.locator("form");
    await form.locator("input").nth(0).fill(name);
    await form.locator("input").nth(1).fill("E2E 账本备注");
    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "新增账本" })).toBeVisible();
    await clickModalOk(page, "保存");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("E2E 账本备注")).toBeVisible();
  });

  test("编辑账本：改名 + 确认框", async ({ page }) => {
    await page.goto("/ledgers");
    const card = page.locator("div.rounded-2xl", { hasText: name });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "修改" }).click();
    const form = page.locator("form");
    await form.locator("input").nth(0).fill(edited);
    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存账本" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test("切换账本：卡片切换按钮 + 跳转与顶栏选中", async ({ page }) => {
    await page.goto("/ledgers");
    const card = page.locator("div.rounded-2xl", { hasText: edited });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "切换" }).click();
    // switchLedger 直接写入 cookie 并整页跳回仪表盘
    await page.waitForURL("**/dashboard");
    const ledgerSelect = page.locator("header select").first();
    await expect(ledgerSelect.locator("option:checked")).toContainText(edited);
  });

  test("删除账本：确认框 + 列表移除", async ({ page }) => {
    // 先经顶栏切回「E2E演示账本」（若当前不是它），避免删除当前账本
    await page.goto("/ledgers");
    const ledgerSelect = page.locator("header select").first();
    const demoOption = ledgerSelect.locator("option", { hasText: "E2E演示账本" });
    await expect(demoOption).toHaveCount(1);
    const isCurrent = await demoOption.evaluate((el) => (el as HTMLOptionElement).selected);
    if (!isCurrent) {
      await ledgerSelect.selectOption((await demoOption.getAttribute("value")) ?? "");
      await page.getByRole("button", { name: "确认" }).click();
      await page.waitForURL("**/dashboard");
      await page.goto("/ledgers");
    }

    const card = page.locator("div.rounded-2xl", { hasText: edited });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除账本" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  });
});
