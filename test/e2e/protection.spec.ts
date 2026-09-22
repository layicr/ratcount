import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("保障 / 公积金", () => {
  const stamp = Date.now();
  const fundName = `E2E公积金${stamp}`;
  const fundEdited = `E2E公积金改${stamp}`;
  const insName = `E2E保险${stamp}`;

  test("保障总览：空态渲染", async ({ page }) => {
    await page.goto("/protection");
    await expect(page.locator("h1", { hasText: "保障总览" })).toBeVisible();
    // 无实际文案「保险与公积金的余额与流水一览」，改为断言统计卡标题（保障总资产）
    await expect(page.getByText("保障总资产")).toBeVisible();
    // 无保障账户：空态提示 + 统计卡账户数为 0
    await expect(page.getByText("暂无保障类账户，去「账户」页新建一个保险 / 公积金账户")).toBeVisible();
    const countCard = page.locator("div.grid.grid-cols-3 > div").nth(1);
    await expect(countCard.locator("div.text-lg.font-bold")).toHaveText("0");
  });

  test("新增保障账户：切换保障类型为公积金", async ({ page }) => {
    await page.goto("/accounts");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    const form = page.locator("form");
    await expect(form).toBeVisible();
    // 账户类型为自定义下拉（按钮 + 弹出面板），切换到公积金
    await form.locator("button", { hasText: "储蓄卡" }).first().click();
    await form.locator("div.absolute.z-50").getByRole("button", { name: "公积金" }).click();
    await expect(form.locator("button", { hasText: "公积金" }).first()).toBeVisible();
    await form.locator("input").nth(0).fill(fundName);
    await form.locator("input").nth(1).fill("5000.00");
    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "新增账户" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText(fundName, { exact: true })).toBeVisible();
  });

  test("保障总览：新增公积金后分类小计联动", async ({ page }) => {
    await page.goto("/protection");
    const summary = page.locator("div.rounded-2xl", { hasText: "分类合计" });
    // 分类小计通过 get("acctType.housingFund") 命中 dict 渲染为「公积金」
    await expect(summary.getByText("公积金")).toBeVisible();
    const countCard = page.locator("div.grid.grid-cols-3 > div").nth(1);
    await expect(countCard.locator("div.text-lg.font-bold")).toHaveText("1");
    const totalCard = page.locator("div.grid.grid-cols-3 > div").nth(0);
    await expect(totalCard.locator("div.text-lg.font-bold")).not.toHaveText("0");
  });

  test("新增保障账户：切换保障类型为储蓄型保险", async ({ page }) => {
    await page.goto("/accounts");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    const form = page.locator("form");
    await expect(form).toBeVisible();
    await form.locator("button", { hasText: "储蓄卡" }).first().click();
    await form.locator("div.absolute.z-50").getByRole("button", { name: "储蓄型保险" }).click();
    await expect(form.locator("button", { hasText: "储蓄型保险" }).first()).toBeVisible();
    await form.locator("input").nth(0).fill(insName);
    await form.locator("input").nth(1).fill("3000.00");
    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "新增账户" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText(insName, { exact: true })).toBeVisible();
  });

  test("编辑保障账户：改名 + 确认框", async ({ page }) => {
    await page.goto("/accounts");
    const card = page.locator("div.rounded-2xl", { hasText: fundName });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "修改" }).click();
    const form = page.locator("form");
    await expect(form).toBeVisible();
    await form.locator("input").nth(0).fill(fundEdited);
    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存账户" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.getByText(fundEdited, { exact: true })).toBeVisible();
    await expect(page.getByText(fundName, { exact: true })).toHaveCount(0);
  });

  test("删除保障账户：确认框 + 列表移除", async ({ page }) => {
    await page.goto("/accounts");
    const card = page.locator("div.rounded-2xl", { hasText: insName });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除账户" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.getByText(insName, { exact: true })).toHaveCount(0);
  });

  test("保障总览：删除后小计仅剩公积金", async ({ page }) => {
    await page.goto("/protection");
    const summary = page.locator("div.rounded-2xl", { hasText: "分类合计" });
    await expect(summary.getByText("公积金")).toBeVisible();
    // 分类小计渲染全部保障类型行，删除保险后总资产应回到仅公积金 5000
    const countCard = page.locator("div.grid.grid-cols-3 > div").nth(1);
    await expect(countCard.locator("div.text-lg.font-bold")).toHaveText("1");
    const totalCard = page.locator("div.grid.grid-cols-3 > div").nth(0);
    await expect(totalCard.locator("div.text-lg.font-bold")).toHaveText("¥5,000.00");
  });
});
