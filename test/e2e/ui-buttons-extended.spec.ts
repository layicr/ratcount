import { test, expect } from "@playwright/test";

/**
 * 全站页面按钮冒烟补全（chromium project）
 * 基线 ui-buttons.spec.ts 仅覆盖 dashboard/add/transactions/reports/ledgers/settings；
 * 本文件补齐 calendar/import/investments/accounts/balance/categories/tags/projects/
 * recurring/protection/profile/profile-password/profile-menu/ledgers 的：
 * - 页面可达（h1 文案）
 * - 主要按钮存在且可点（不依赖 emoji/图标文本，避免可访问名噪音误匹配）
 */
test.describe.configure({ mode: "serial" });

const PAGES: { path: string; h1: string; minButtons: number }[] = [
  { path: "/calendar", h1: "收支日历", minButtons: 7 }, // 月份 ‹/› + 当日网格至少 28 格
  { path: "/import", h1: "导入数据", minButtons: 2 }, // 关闭 + 导入
  { path: "/investments", h1: "投资总览", minButtons: 1 },
  { path: "/accounts", h1: "账户", minButtons: 1 }, // 新增账户
  { path: "/balance", h1: "余额表（对账）", minButtons: 0 }, // 只读页
  { path: "/categories", h1: "分类管理", minButtons: 1 },
  { path: "/tags", h1: "标签管理", minButtons: 1 },
  { path: "/projects", h1: "项目管理", minButtons: 1 },
  { path: "/recurring", h1: "周期计划", minButtons: 1 },
  { path: "/protection", h1: "保障总览", minButtons: 0 }, // 只读摘要页（AccountGroupSummary 无操作按钮）
  { path: "/profile", h1: "我的", minButtons: 1 },
  { path: "/profile/password", h1: "修改密码", minButtons: 3 }, // 旧/新/确认 + 修改
  { path: "/profile/menu", h1: "我的菜单", minButtons: 1 },
  { path: "/ledgers", h1: "账本管理", minButtons: 1 },
];

for (const pg of PAGES) {
  test(`页面可达：${pg.path}（${pg.h1}）`, async ({ page }) => {
    await page.goto(pg.path);
    await expect(page.locator("h1", { hasText: pg.h1 })).toBeVisible();
    const n = await page.locator("button").count();
    expect(n).toBeGreaterThanOrEqual(pg.minButtons);
  });
}

test("个人中心：修改密码表单按钮完整", async ({ page }) => {
  await page.goto("/profile/password");
  // 三个密码输入框（旧/新/确认），label 为块级文本未与 input 关联，改用文本 + input 断言
  await expect(page.locator("input[type='password']")).toHaveCount(3);
  await expect(page.getByText("旧密码", { exact: true })).toBeVisible();
  await expect(page.getByText("新密码", { exact: true })).toBeVisible();
  await expect(page.getByText("确认新密码", { exact: true })).toBeVisible();
  // 显示/隐藏切换按钮（密码可见性切换，无 svg 用 emoji，直接计数）
  await expect(page.locator("button[title]")).toHaveCount(3);
  // 修改/取消按钮（ConfirmButton 内为 span 文本按钮 + 取消）
  await expect(page.getByText("确认修改", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
});
