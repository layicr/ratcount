/**
 * 设置中心 E2E（/settings/currencies、languages、menu-groups、menus、users）
 * - 复用 auth.setup.ts 登录态（admin@example.com / demo1234，seed-e2e.ts 写入）
 * - 覆盖：币种/语言增删改+启用停用切换；菜单分组/菜单增删改；用户增删改+重置密码
 * - serial 模式：先建后删，跨用例共享唯一标识（stamp 后缀）
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

/** 按 label 文本定位其父容器内的输入控件（label 直接父 div 含 input/select） */
async function fillIfVisible(page: Page, text: string, value: string, kind: "fill" | "select" = "fill") {
  const label = page.locator("label", { hasText: text }).last();
  if ((await label.count()) === 0) return;
  try {
    await label.waitFor({ state: "visible", timeout: 1500 });
  } catch {
    return;
  }
  const el = label.locator("xpath=..").locator("input, select, textarea").first();
  if ((await el.count()) === 0) return;
  await el.waitFor({ state: "visible", timeout: 1500 });
  if (kind === "select") await el.selectOption({ index: 1 });
  else await el.fill(value);
}

/** 多语言名称（中文）字段：菜单/分组的 label 为「名称（中文）」，避开 English/繁体 */
async function fillZhName(page: Page, value: string) {
  await fillIfVisible(page, "名称（中文）", value);
}

test.describe("设置中心", () => {
  const stamp = Date.now() % 100000;
  const curCode = `TST${stamp}`;
  const curName = `E2E币种${stamp}`;
  const langCode = `fr${stamp}`;
  const langName = `E2E语言${stamp}`;
  const grpId = `e2egrp${stamp}`;
  const grpName = `E2E分组${stamp}`;
  const menuId = `e2emenu${stamp}`;
  const menuName = `E2E菜单${stamp}`;
  const userEmail = `e2e${stamp}@test.com`;
  const userName = `E2E用户${stamp}`;

  test.describe("币种管理", () => {
    test("新增币种", async ({ page }) => {
      await page.goto("/settings/currencies");
      await expect(page.locator("h1", { hasText: "币种管理" })).toBeVisible();
      await page.getByRole("button", { name: "新增", exact: true }).click();
      await fillIfVisible(page, "币种代码", curCode);
      await fillIfVisible(page, "符号", "T");
      await fillIfVisible(page, "名称", curName);
      await fillIfVisible(page, "汇率", "2.5");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "保存币种" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: curCode })).toHaveCount(1);
    });

    test("编辑币种", async ({ page }) => {
      await page.goto("/settings/currencies");
      const row = page.locator("tbody tr", { hasText: curCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "修改", exact: true }).click();
      await fillIfVisible(page, "名称", curName + "改");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "保存币种" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: curCode }).getByText(curName + "改")).toBeVisible();
    });

    test("停用币种", async ({ page }) => {
      await page.goto("/settings/currencies");
      const row = page.locator("tbody tr", { hasText: curCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "启用中", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "停用币种" })).toBeVisible();
      await clickModalOk(page, "停用");
      await expect(page.locator("tbody tr", { hasText: curCode }).getByText("已停用")).toBeVisible();
    });

    test("启用币种", async ({ page }) => {
      await page.goto("/settings/currencies");
      const row = page.locator("tbody tr", { hasText: curCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "已停用", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "启用币种" })).toBeVisible();
      await clickModalOk(page, "启用");
      await expect(page.locator("tbody tr", { hasText: curCode }).getByText("启用中")).toBeVisible();
    });

    test("删除币种", async ({ page }) => {
      await page.goto("/settings/currencies");
      const row = page.locator("tbody tr", { hasText: curCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "删除", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "删除币种" })).toBeVisible();
      await clickModalOk(page, "删除");
      await expect(page.locator("tbody tr", { hasText: curCode })).toHaveCount(0);
    });
  });

  test.describe("语言配置", () => {
    test("新增语言", async ({ page }) => {
      await page.goto("/settings/languages");
      await expect(page.locator("h1", { hasText: "语言配置" })).toBeVisible();
      await page.getByRole("button", { name: "新增", exact: true }).click();
      await fillIfVisible(page, "语言代码", langCode);
      await fillIfVisible(page, "显示名称", langName);
      await fillIfVisible(page, "本语自称", "E2E Native");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "新增语言" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: langCode })).toHaveCount(1);
    });

    test("编辑语言", async ({ page }) => {
      await page.goto("/settings/languages");
      const row = page.locator("tbody tr", { hasText: langCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "修改", exact: true }).click();
      await fillIfVisible(page, "显示名称", langName + "改");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "保存语言" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: langCode }).getByText(langName + "改")).toBeVisible();
    });

    test("停用语言", async ({ page }) => {
      await page.goto("/settings/languages");
      const row = page.locator("tbody tr", { hasText: langCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "启用中", exact: true }).click();
      // 注：i18n 中语言停用弹窗标题复用币种文案（settings.deactTitle="停用币种"）
      await expect(modal(page).getByRole("heading", { name: "停用币种" })).toBeVisible();
      await clickModalOk(page, "停用");
      await expect(page.locator("tbody tr", { hasText: langCode }).getByText("已停用")).toBeVisible();
    });

    test("启用语言", async ({ page }) => {
      await page.goto("/settings/languages");
      const row = page.locator("tbody tr", { hasText: langCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "已停用", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "启用币种" })).toBeVisible();
      await clickModalOk(page, "启用");
      await expect(page.locator("tbody tr", { hasText: langCode }).getByText("启用中")).toBeVisible();
    });

    test("删除语言", async ({ page }) => {
      await page.goto("/settings/languages");
      const row = page.locator("tbody tr", { hasText: langCode });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "删除", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "删除语言" })).toBeVisible();
      await clickModalOk(page, "删除");
      await expect(page.locator("tbody tr", { hasText: langCode })).toHaveCount(0);
    });
  });

  test.describe("菜单分组", () => {
    test("新增分组", async ({ page }) => {
      await page.goto("/settings/menu-groups");
      await expect(page.locator("h1", { hasText: "菜单分组管理" })).toBeVisible();
      await page.getByRole("button", { name: "新增", exact: true }).click();
      await fillIfVisible(page, "分组标识", grpId);
      await fillZhName(page, grpName);
      await fillIfVisible(page, "排序", "99");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "新增" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: grpId })).toHaveCount(1);
    });

    test("编辑分组", async ({ page }) => {
      await page.goto("/settings/menu-groups");
      const row = page.locator("tbody tr", { hasText: grpId });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "修改", exact: true }).click();
      await fillZhName(page, grpName + "改");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "保存分组" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: grpId }).getByText(grpName + "改")).toBeVisible();
    });
  });

  test.describe("菜单管理", () => {
    test("新增菜单", async ({ page }) => {
      await page.goto("/settings/menus");
      await expect(page.locator("h1", { hasText: "菜单管理" })).toBeVisible();
      await page.getByRole("button", { name: "新增", exact: true }).click();
      await fillIfVisible(page, "菜单标识", menuId);
      await fillZhName(page, menuName);
      await fillIfVisible(page, "链接", "/dashboard");
      // 所属分组下拉：选择上面已改名的分组
      const box = page.locator("label", { hasText: "所属分组" }).last().locator("xpath=..");
      await box.locator("select").first().selectOption({ label: grpName + "改" });
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "新增" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: menuId })).toHaveCount(1);
    });

    test("编辑菜单", async ({ page }) => {
      await page.goto("/settings/menus");
      const row = page.locator("tbody tr", { hasText: menuId });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "修改", exact: true }).click();
      await fillZhName(page, menuName + "改");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "保存菜单" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("tbody tr", { hasText: menuId }).getByText(menuName + "改")).toBeVisible();
    });

    test("删除菜单", async ({ page }) => {
      await page.goto("/settings/menus");
      const row = page.locator("tbody tr", { hasText: menuId });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "删除", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "删除菜单" })).toBeVisible();
      await clickModalOk(page, "删除");
      await expect(page.locator("tbody tr", { hasText: menuId })).toHaveCount(0);
    });
  });

  test.describe("菜单分组删除", () => {
    test("删除分组", async ({ page }) => {
      await page.goto("/settings/menu-groups");
      const row = page.locator("tbody tr", { hasText: grpId });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "删除", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "删除分组" })).toBeVisible();
      await clickModalOk(page, "删除");
      await expect(page.locator("tbody tr", { hasText: grpId })).toHaveCount(0);
    });
  });

  test.describe("用户管理", () => {
    test("新增用户", async ({ page }) => {
      await page.goto("/settings/users");
      await expect(page.locator("h1", { hasText: "用户管理" })).toBeVisible();
      await page.getByRole("link", { name: "新增", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\/users\/new$/);
      await fillIfVisible(page, "昵称", userName);
      await fillIfVisible(page, "邮箱", userEmail);
      await fillIfVisible(page, "密码", "E2epass123");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      // user-form ConfirmButton 标题为 common.add（「新增」），非「新增用户」
      await expect(modal(page).getByRole("heading", { name: "新增" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("h1", { hasText: "用户管理" })).toBeVisible();
      await expect(page.locator("tbody tr", { hasText: userEmail })).toHaveCount(1);
    });

    test("重置密码（双层确认）", async ({ page }) => {
      await page.goto("/settings/users");
      const row = page.locator("tbody tr", { hasText: userEmail });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "重置密码", exact: true }).click();
      // 第一层：重置密码弹窗（自定义 fixed inset-0）
      const outer = modal(page).first();
      await expect(outer.getByRole("heading", { name: "重置密码" })).toBeVisible();
      await outer.locator("input[type=password]").fill("Newpass123");
      await outer.getByRole("button", { name: "确认重置", exact: true }).click();
      // 第二层：ConfirmButton 二次确认弹窗
      const inner = modal(page).last();
      await expect(inner.getByText("确认重置该用户的密码？")).toBeVisible();
      await inner.getByRole("button", { name: "确认重置", exact: true }).click();
      await expect(page.getByText("密码重置成功")).toBeVisible();
    });

    test("编辑用户", async ({ page }) => {
      await page.goto("/settings/users");
      const row = page.locator("tbody tr", { hasText: userEmail });
      await expect(row).toHaveCount(1);
      await row.getByRole("link", { name: "修改", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\/users\/[^/]+\/edit$/);
      await fillIfVisible(page, "昵称", userName + "改");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      // user-form 编辑态 ConfirmButton 标题为 common.edit（「修改」），非「编辑用户」
      await expect(modal(page).getByRole("heading", { name: "修改" })).toBeVisible();
      await clickModalOk(page, "保存");
      await expect(page.locator("h1", { hasText: "用户管理" })).toBeVisible();
      await expect(page.locator("tbody tr", { hasText: userEmail }).getByText(userName + "改")).toBeVisible();
    });

    test("删除用户", async ({ page }) => {
      await page.goto("/settings/users");
      const row = page.locator("tbody tr", { hasText: userEmail });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "删除", exact: true }).click();
      await expect(modal(page).getByRole("heading", { name: "删除用户" })).toBeVisible();
      await clickModalOk(page, "删除");
      await expect(page.locator("tbody tr", { hasText: userEmail })).toHaveCount(0);
    });
  });
});
