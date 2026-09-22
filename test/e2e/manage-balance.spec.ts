import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("余额快照记录", () => {
  test("着陆：显示标题与记录表单", async ({ page }) => {
    await page.goto("/balance");
    await expect(page.locator("h1", { hasText: "余额表（对账）" })).toBeVisible();
    await expect(page.getByText("记录余额快照")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
  });

  test("记录余额快照：选择账户 + 确认框 + 表格更新", async ({ page }) => {
    await page.goto("/balance");
    // BalanceForm 内的账户下拉（顶栏还有账本/语言两个 select，须限定在表单内）
    const sel = page.locator("form select");
    const accountName = (await sel.locator("option").nth(1).textContent())?.trim() ?? "";
    expect(accountName.length).toBeGreaterThan(0);
    await sel.selectOption({ index: 1 });

    const form = page.locator("form");
    await form.locator("input").nth(0).fill("888.00");
    // 快照日期默认今天（表单回显值），备注
    await form.locator("input").nth(2).fill("E2E 快照备注");
    const snapshotDate = await form.locator("input").nth(1).inputValue();

    await form.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存余额快照" })).toBeVisible();
    await clickModalOk(page, "保存");

    // 成功提示
    await expect(page.getByText("✓ 快照已保存")).toBeVisible();
    // 对账表中该账户「最新快照」列（td 序：0账户/1类型/2期初/3实时余额/4最新快照/5差异）
    // 出现金额与日期；实时余额/差异列可能含相同金额子串，须限定列避免 strict 双匹配
    const row = page.locator("tbody tr", { hasText: accountName });
    const snapshotCell = row.locator("td").nth(4);
    await expect(snapshotCell).toContainText("¥888.00");
    await expect(snapshotCell).toContainText(snapshotDate);
  });
});
