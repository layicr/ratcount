import { test, expect, type Page } from "@playwright/test";

/**
 * 报表 / 日历 / 编辑流水 / 转账 / 记账表单校验 E2E（chromium project，复用 setup 登录态）
 * 覆盖点（对齐既有缺口审计）：
 * - 报表 6 页签逐个跳转 + 激活态 + 分类页签支出/收入切换
 * - 收支日历：着陆、今日格展开当日明细（seed 流水）、月份前后切换、月份 input 直改
 * - 编辑流水：行内「修改」进入编辑页，金额预填，保存后列表更新（编辑页复用 AddForm）
 * - 转账流水：转账 tab 完整链路（转出/转入账户必选），列表类型徽标与备注
 * - 记账表单校验拦截：必填 / 账户 / 分类 / 转入账户（ConfirmButton beforeOpen 拦截，不出确认框）
 */
test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

/** 当前本地日期（Asia/Shanghai） */
function todayParts(): { y: string; m: string; d: string } {
  const n = new Date();
  return {
    y: String(n.getFullYear()),
    m: String(n.getMonth() + 1).padStart(2, "0"),
    d: String(n.getDate()).padStart(2, "0"),
  };
}

/** 按 label 文本（账户/转出账户/转入账户）定位 select 并选中包含 name 的 option */
async function selectAccount(page: Page, label: string, name: string) {
  const box = page
    .locator("div")
    .filter({ has: page.locator("label").filter({ hasText: label }) })
    .last();
  const idx = (
    await box.locator("select option").allTextContents()
  ).findIndex((t) => t.includes(name));
  expect(idx).toBeGreaterThanOrEqual(0);
  await box.locator("select").selectOption({ index: idx });
}

/** 保存流水：点表单保存按钮 → 确认框标题 → 点「保存」→ 回到流水列表 */
async function saveTx(page: Page, modalTitle: string) {
  await page.getByRole("button", { name: /保\s*存/ }).first().click();
  await expect(modal(page).getByText(modalTitle)).toBeVisible();
  await modal(page).getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL("**/transactions");
}

test.describe("报表页签", () => {
  const TABS = [
    { v: "overview", label: "总览" },
    { v: "trend", label: "趋势" },
    { v: "category", label: "分类" },
    { v: "project", label: "项目" },
    { v: "tag", label: "标签" },
    { v: "asset", label: "资产" },
  ];

  for (const tab of TABS) {
    test(`报表页签「${tab.label}」可跳转且激活`, async ({ page }) => {
      await page.goto("/reports");
      await expect(page.locator("h1", { hasText: "报表" })).toBeVisible();
      await page.getByRole("link", { name: tab.label, exact: true }).click();
      await page.waitForURL(new RegExp(`[?&]tab=${tab.v}`));
      await expect(
        page.getByRole("link", { name: tab.label, exact: true })
      ).toHaveClass(/bg-teal-600/);
    });
  }

  test("报表分类页签支出/收入切换", async ({ page }) => {
    await page.goto("/reports?tab=category&catType=expense");
    await expect(page.locator("h1", { hasText: "报表" })).toBeVisible();
    await expect(page.getByRole("link", { name: "支出", exact: true })).toHaveClass(/bg-teal-600/);
    await page.getByRole("link", { name: "收入", exact: true }).click();
    await page.waitForURL(/[?&]catType=income/);
    await expect(page.getByRole("link", { name: "收入", exact: true })).toHaveClass(/bg-teal-600/);
  });
});

test.describe("收支日历", () => {
  test("着陆：标题/月份输入与今日格子可见", async ({ page }) => {
    const { y, m } = todayParts();
    await page.goto("/calendar");
    await expect(page.locator("h1", { hasText: "收支日历" })).toBeVisible();
    await expect(page.locator('input[type="month"]')).toHaveValue(`${y}-${m}`);
  });

  test("今日格子展开当日明细（seed 流水可见）", async ({ page }) => {
    const { y, m, d } = todayParts();
    await page.goto("/calendar");
    const dayCell = page.getByRole("button", { name: new RegExp("^" + d) }).first();
    await expect(dayCell).toBeVisible();
    await dayCell.click();
    await expect(page.getByText("当日流水")).toBeVisible();
    // seed 当月 2 条流水：工资入账（收入-工资卡）、餐饮开销（支出-现金）
    await expect(page.getByText("工资入账", { exact: true })).toBeVisible();
    await expect(page.getByText("餐饮开销", { exact: true })).toBeVisible();
    await expect(page.getByText("工资卡", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("现金", { exact: true }).first()).toBeVisible();
  });

  test("月份前后切换与 input 直改", async ({ page }) => {
    const { y, m } = todayParts();
    const cur = `${y}-${m}`;
    const next = m === "12" ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, "0")}`;
    const prev = m === "01" ? `${Number(y) - 1}-12` : `${y}-${String(Number(m) - 1).padStart(2, "0")}`;

    await page.goto("/calendar");
    // › 下月
    await page.getByRole("link", { name: "›" }).click();
    await page.waitForURL(new RegExp(`[?&]month=${next}`));
    await expect(page.locator('input[type="month"]')).toHaveValue(next);
    // ‹ 返回当月
    await page.getByRole("link", { name: "‹" }).click();
    await page.waitForURL(new RegExp(`[?&]month=${cur}`));
    await expect(page.locator('input[type="month"]')).toHaveValue(cur);
    // input 直改到上月
    await page.locator('input[type="month"]').fill(prev);
    await page.waitForURL(new RegExp(`[?&]month=${prev}`));
  });
});

test.describe("编辑流水（编辑页复用 AddForm）", () => {
  test("创建→行内修改→保存后列表更新", async ({ page }) => {
    const srcRemark = `E2E编辑源-${Date.now()}`;
    const newRemark = `E2E编辑后-${Date.now()}`;

    // 1. 创建一笔支出作为编辑对象
    await page.goto("/add");
    await page.getByPlaceholder("0.00").fill("45.67");
    await selectAccount(page, "账户", "现金");
    await page.getByRole("button", { name: /餐饮/ }).click();
    await page.getByPlaceholder("记点什么…").fill(srcRemark);
    await saveTx(page, "保存流水");
    await expect(page.getByText(srcRemark, { exact: true })).toBeVisible();

    // 2. 行内「修改」进入编辑页
    const row = page.locator("tbody tr", { hasText: srcRemark }).first();
    await row.getByRole("link", { name: "修改" }).click();
    await page.waitForURL(/\/transactions\/[^/]+\/edit/);
    await expect(page.locator("h1", { hasText: "修改流水" })).toBeVisible();
    // 编辑页金额预填（AddForm initialTx）
    await expect(page.getByPlaceholder("0.00")).toHaveValue("45.67");
    // 编辑态锁定类型：仅渲染当前类型 tab 且不可切换（收入/转账 tab 不出现）
    await expect(page.getByRole("button", { name: "支出", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "收入", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "转账", exact: true })).toHaveCount(0);

    // 3. 改备注并保存
    await page.getByPlaceholder("记点什么…").fill(newRemark);
    await saveTx(page, "修改流水");
    await expect(page.getByText(newRemark, { exact: true })).toBeVisible();
    await expect(page.getByText(srcRemark, { exact: true })).toHaveCount(0);
  });
});

test.describe("转账流水", () => {
  test("转账完整链路：类型徽标 + 备注落库", async ({ page }) => {
    const remark = `E2E转账-${Date.now()}`;
    await page.goto("/add");
    // 切转账 tab
    await page.getByRole("button", { name: "转账", exact: true }).click();
    await expect(page.getByText("转出账户")).toBeVisible();
    await expect(page.getByText("转入账户")).toBeVisible();
    // 转账模式无分类区（exact 避免命中导航「分类管理」）
    await expect(page.getByText("分类", { exact: true })).toHaveCount(0);

    await page.getByPlaceholder("0.00").fill("12.34");
    await selectAccount(page, "转出账户", "现金");
    await selectAccount(page, "转入账户", "工资卡");
    await page.getByPlaceholder("记点什么…").fill(remark);
    await saveTx(page, "保存流水");

    const row = page.locator("tbody tr", { hasText: remark }).first();
    await expect(row.getByText("转账", { exact: true })).toBeVisible();
    await expect(row.getByText(/工资卡/)).toBeVisible();
  });

  test("转出与转入账户相同时校验拦截", async ({ page }) => {
    await page.goto("/add");
    await page.getByRole("button", { name: "转账", exact: true }).click();
    await page.getByPlaceholder("0.00").fill("8.00");
    await selectAccount(page, "转出账户", "现金");
    // 转入账户下拉已排除转出账户：现金不应出现
    const toBox = page
      .locator("div")
      .filter({ has: page.locator("label").filter({ hasText: "转入账户" }) })
      .last();
    const opts = await toBox.locator("select option").allTextContents();
    expect(opts.some((t) => t.includes("现金"))).toBe(false);
    // 不选转入账户直接保存 → 校验拦截
    await page.getByRole("button", { name: /保\s*存/ }).first().click();
    await expect(page.getByText("请选择转入账户")).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe("记账表单校验拦截", () => {
  test("空提交拦截：必填", async ({ page }) => {
    await page.goto("/add");
    await page.getByRole("button", { name: /保\s*存/ }).first().click();
    await expect(page.getByText("必填", { exact: true })).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  test("金额已填但未选账户：请选择账户", async ({ page }) => {
    await page.goto("/add");
    await page.getByPlaceholder("0.00").fill("10.00");
    await page.getByRole("button", { name: /保\s*存/ }).first().click();
    await expect(page.getByText("请选择账户")).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  test("未选分类：请选择分类", async ({ page }) => {
    await page.goto("/add");
    await page.getByPlaceholder("0.00").fill("10.00");
    await selectAccount(page, "账户", "现金");
    await page.getByRole("button", { name: /保\s*存/ }).first().click();
    await expect(page.getByText("请选择分类")).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });
});
