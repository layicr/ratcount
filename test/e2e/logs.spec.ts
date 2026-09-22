/**
 * 操作日志页 E2E（/settings/logs）
 * - 复用 auth.setup.ts 登录态（admin@example.com / demo1234，seed-e2e.ts 写入）
 * - 依赖 seed-e2e.ts 插入的 3 条审计日志（summary 含 AnchorLogCreate/Update/Delete）
 * - 覆盖：渲染与工具栏 / 行展开请求响应 / 筛选与清空 / 全选批量删除
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

test.describe("操作日志", () => {
  test("日志页：渲染与工具栏", async ({ page }) => {
    await page.goto("/settings/logs");
    await expect(page.locator("h1", { hasText: "操作日志" })).toBeVisible();
    await expect(page.getByPlaceholder("搜索")).toBeVisible();
    await expect(page.getByRole("button", { name: "筛选", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "清理超期", exact: true })).toBeVisible();
    // 未选中任何日志时批量删除为禁用态
    await expect(page.getByRole("button", { name: "批量删除", exact: true })).toBeDisabled();
    // 种子日志可能被测试产生的操作日志推到后面分页，先搜索定位
    await page.getByPlaceholder("搜索").fill("种子日志");
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await expect(page.locator("tbody tr", { hasText: "AnchorLogCreate" })).toHaveCount(1);
    await expect(page.locator("tbody tr", { hasText: "AnchorLogUpdate" })).toHaveCount(1);
    await expect(page.locator("tbody tr", { hasText: "AnchorLogDelete" })).toHaveCount(1);
    // 清空筛选恢复全量
    await page.getByRole("button", { name: "清空", exact: true }).click();
    await expect(page).not.toHaveURL(/q=/);
  });

  test("日志：行展开请求/响应", async ({ page }) => {
    await page.goto("/settings/logs");
    // 搜索定位种子日志 AnchorLogCreate 行（避免被后续操作日志推离首页）
    await page.getByPlaceholder("搜索").fill("AnchorLogCreate");
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const row = page.locator("tbody tr", { hasText: "AnchorLogCreate" });
    await expect(row).toHaveCount(1);
    // 展开按钮位于数据行下方的 detail 行
    const detail = row.locator("xpath=following-sibling::tr[1]");
    await detail.getByRole("button", { name: "查看请求/响应", exact: true }).click();
    // 表头也有「请求内容/响应内容」列名，限定 tbody 内断言展开区
    const body = page.locator("tbody");
    await expect(body.getByText("请求内容", { exact: true })).toBeVisible();
    await expect(body.getByText("响应内容", { exact: true })).toBeVisible();
    const pres = body.locator("pre");
    await expect(pres).toHaveCount(2);
    await expect(pres.nth(0)).toContainText('"code"');
    await expect(pres.nth(1)).toContainText('"ok":true');
    // 收起后展开区消失
    await detail.getByRole("button", { name: "收起", exact: true }).click();
    await expect(page.locator("pre")).toHaveCount(0);
    await expect(body.getByText("请求内容", { exact: true })).toHaveCount(0);
  });

  test("日志：筛选与清空", async ({ page }) => {
    await page.goto("/settings/logs");
    await page.getByPlaceholder("搜索").fill("AnchorLogCreate");
    // 回车触发搜索（与「筛选」按钮等价，避免点击竞态）
    await page.getByPlaceholder("搜索").press("Enter");
    await expect(page).toHaveURL(/q=AnchorLogCreate/);
    // 有 body 的日志带 detail 行，按数据行文本断言筛选结果
    await expect(page.locator("tbody tr", { hasText: "AnchorLogCreate" })).toHaveCount(1);
    await expect(page.locator("tbody tr", { hasText: "AnchorLogUpdate" })).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "AnchorLogDelete" })).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "种子日志-新增币种" })).toBeVisible();
    // 清空筛选恢复全量（列表按时间倒序，种子日志可能被测试产生的操作日志推到后面分页，不在当页断言其可见）
    await page.getByRole("button", { name: "清空", exact: true }).click();
    await expect(page).not.toHaveURL(/q=/);
    // 重新搜索定位种子日志，验证清空筛选未删除任何数据
    await page.getByPlaceholder("搜索").fill("种子日志");
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await expect(page.locator("tbody tr", { hasText: "种子日志" })).toHaveCount(3);
  });

  test("日志：全选批量删除", async ({ page }) => {
    await page.goto("/settings/logs");
    // 先搜索种子日志，确保待删除目标在当前页内（全选仅作用于当前页）
    await page.getByPlaceholder("搜索").fill("种子日志");
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await expect(page.locator("tbody tr", { hasText: "种子日志" })).toHaveCount(3);
    // 表头全选 checkbox（label 文本「全选（x/y）」）
    const selectAll = page.locator("label", { hasText: "全选" }).locator("input[type=checkbox]");
    await selectAll.check();
    const batchBtn = page.getByRole("button", { name: /批量删除/ });
    await expect(batchBtn).toBeEnabled();
    await batchBtn.click();
    await expect(modal(page).getByRole("heading", { name: "批量删除日志" })).toBeVisible();
    await clickModalOk(page, "删除");
    // 3 条种子日志被删
    await expect(page.locator("tbody tr", { hasText: "种子日志" })).toHaveCount(0);
  });
});
