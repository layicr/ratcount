import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 导入 / 导出 E2E（chromium project）
 * 覆盖点（对齐既有缺口审计）：
 * - 导入三步正向：CSV 上传 → 检查（文件名/已选择）→ 导入 → 汇总报告（成功/失败/消息）→ 流水落库
 * - 导入失败行：行级错误明细（第 N 行：必填）
 * - 非 xlsx/csv 文件上传拦截（仅支持 .xlsx / .csv 格式）
 * - 模板下载（/api/import/template 返回 xlsx 附件）
 * - 导出数据（/api/export 返回 ratcount-export-*.xlsx 附件）
 */
test.describe.configure({ mode: "serial" });

const TMP_DIR = join(__dirname, ".import-tmp");

function csvPath(name: string): string {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  return join(TMP_DIR, name);
}

const HEADER = "类型,日期,账户,转入账户,分类,项目,金额,备注,标签";

async function uploadAndImport(page: import("@playwright/test").Page, file: string) {
  await page.goto("/import");
  await expect(page.locator("h1", { hasText: "导入数据" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
}

test.afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

test.describe("导入数据", () => {
  test("三步导入正向：报告 + 流水落库", async ({ page }) => {
    const remark = `E2E导入-${Date.now()}`;
    const csv = csvPath(`import-ok-${Date.now()}.csv`);
    writeFileSync(csv, `${HEADER}\n支出,2026-09-26,现金,,餐饮,,66.66,${remark},\n`, "utf8");

    await uploadAndImport(page, csv);
    // 步骤 2：检查数据（文件名 + 已选择文件，文案后跟文件大小）
    await expect(page.getByText(/已选择文件/)).toBeVisible();
    await expect(page.getByText(csv.split(/[\\/]/).pop()!, { exact: true })).toBeVisible();
    // 步骤 3：导入
    await page.getByRole("button", { name: "导入", exact: true }).click();
    await expect(page.getByText("导入完成：成功 1 行，失败 0 行", { exact: true })).toBeVisible();
    await expect(page.getByText("成功 1 行", { exact: true })).toBeVisible();
    await expect(page.getByText("失败 0 行", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "导入完成，请查看返回报告" })).toBeVisible();

    // 流水落库
    await page.goto("/transactions");
    const row = page.locator("tbody tr", { hasText: remark }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/66\.66/)).toBeVisible();
  });

  test("失败行级明细：缺必填字段", async ({ page }) => {
    const okRemark = `E2E导入OK-${Date.now()}`;
    const csv = csvPath(`import-fail-${Date.now()}.csv`);
    writeFileSync(
      csv,
      `${HEADER}\n支出,2026-09-26,现金,,餐饮,,66.66,${okRemark},\n支出,,,餐饮,,66.66,E2E导入BAD,\n`,
      "utf8",
    );

    await uploadAndImport(page, csv);
    await page.getByRole("button", { name: "导入", exact: true }).click();
    await expect(page.getByText("导入完成：成功 1 行，失败 1 行", { exact: true })).toBeVisible();
    await expect(page.getByText("成功 1 行", { exact: true })).toBeVisible();
    await expect(page.getByText("失败 1 行", { exact: true })).toBeVisible();
    // 失败明细：第 3 行必填错误（表头占 1 行）
    await expect(page.getByText("第 3 行：类型/日期/账户/金额为必填", { exact: true })).toBeVisible();
    // 合法行仍成功落库
    await page.goto("/transactions");
    await expect(page.locator("tbody tr", { hasText: okRemark }).first()).toBeVisible();
  });

  test("非 xlsx/csv 文件上传拦截", async ({ page }) => {
    const bad = csvPath(`bad-${Date.now()}.txt`);
    writeFileSync(bad, "not a spreadsheet", "utf8");
    await uploadAndImport(page, bad);
    await expect(page.getByText("仅支持 .xlsx / .csv 格式", { exact: true })).toBeVisible();
  });

  test("模板下载：返回 xlsx 附件", async ({ page }) => {
    await page.goto("/import");
    const dlPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载模板" }).click();
    const dl = await dlPromise;
    expect(dl.suggestedFilename()).toMatch(/^ratcount-import-template-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

test.describe("导出数据", () => {
  test("个人中心导出按钮：返回 xlsx 附件", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("h1", { hasText: "我的" })).toBeVisible();
    const dlPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "导出数据（Excel）" }).click();
    const dl = await dlPromise;
    expect(dl.suggestedFilename()).toMatch(/^ratcount-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
