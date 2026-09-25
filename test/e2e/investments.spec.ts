import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const modal = (page: Page) => page.locator("div.fixed.inset-0");

async function clickModalOk(page: Page, text: string) {
  const ok = modal(page).getByRole("button", { name: text, exact: true });
  await expect(ok).toBeVisible();
  await ok.click();
}

/**
 * 前置：确保存在指定账户类型（ACCOUNT_TYPES 面板内索引 typeNth）的账户。
 * 种子库仅含 现金/工资卡/基金账户，投资表单的关联账户按持仓类型限定账户类型，
 * 缺失类型账户时下拉只有「请选择」，需先经 /accounts 创建。
 * 表单按钮顺序：0=IconPicker 触发器，1=AccountTypeSelect 触发器；
 * 类型面板按钮按 ACCOUNT_TYPES 顺序渲染，可访问名仅含图标。
 */
async function ensureAccount(page: Page, acctName: string, typeNth: number) {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "新增" }).click();
  const form = page.locator("form");
  await form.locator("input").nth(0).fill(acctName);
  await form.locator("button").nth(1).click();
  await page.locator("div.absolute.z-50 button").nth(typeNth).click();
  await form.locator("input").nth(1).fill("1000");
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(modal(page).getByRole("heading", { name: "新增账户" })).toBeVisible();
  await clickModalOk(page, "保存");
  await expect(page.getByText(acctName, { exact: true })).toBeVisible();
}

/** 按 label 文本定位表单字段（label 所在最内层 div 内的 input/select） */
async function fieldByLabel(page: Page, text: string) {
  return page
    .locator("div")
    .filter({ has: page.locator("label", { hasText: text }) })
    .last()
    .locator("input, select")
    .first();
}

/** 等待元素已被 React 接管（DOM 上挂载 __reactProps$xxx fiber 属性）。
 * SSR 首屏 input 虽可交互，但 hydration 未完成时 fill 只写 DOM、React state 不更新，
 * 保存即被前端校验拦截。此函数确保 fill 前事件已绑定。 */
async function waitReactBound(page: Page, el: ReturnType<Page["locator"]>) {
  let attrs: string[] = [];
  for (let i = 0; i < 60; i++) {
    attrs = await el
      .evaluate((n) => Object.getOwnPropertyNames(n).filter((k) => k.startsWith("__react")))
      .catch(() => [] as string[]);
    if (attrs.length > 0) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  console.log(`REACT_BOUND TIMEOUT attrs=${attrs.slice(0, 5).join(",")}`);
  return false;
}

/** 若 label 存在则填充/选择（投资表单按类型动态展示字段；select 默认选第 2 项）。
 * 投资表单为 SSR 独立页，fill 可能抢在 React hydration 前写入 DOM 导致 state 未同步，
 * 故先等 React 绑定，写入后再读回校验，值不符则重试，最多 3 次。 */
async function fillIfVisible(
  page: Page,
  text: string,
  value: string,
  kind: "fill" | "select" = "fill",
  selectIndex = 1
) {
  const box = page.locator("div").filter({ has: page.locator("label", { hasText: text }) }).last();
  // 点击「新增」为客户端导航，count() 即时查询可能在页面加载完成前返回 0，轮询等待 label 出现
  let boxCount = await box.count();
  for (let i = 0; boxCount === 0 && i < 50; i++) {
    await page.waitForTimeout(100);
    boxCount = await box.count();
  }
  if (boxCount === 0) {
    return;
  }
  const el = box.locator("input, select").first();
  const elCount = await el.count();
  if (elCount === 0) {
    console.log(`FILL_SKIP el=0 text=${text}`);
    return;
  }
  try {
    await el.waitFor({ state: "visible", timeout: 1500 });
  } catch {
    return;
  }
  await waitReactBound(page, el);
  for (let i = 0; i < 3; i++) {
    if (kind === "select") {
      await el.selectOption({ index: selectIndex });
      await page.waitForTimeout(150);
      const v = await el.inputValue().catch(() => "");
      if (v && v !== "") return;
    } else {
      await el.fill(value);
      await page.waitForTimeout(150);
      const v = await el.inputValue().catch(() => "");
      if (v === value) return;
    }
  }
}

/** 10 个投资类型页：路径 + 列表标题（nav 长名） + 总览卡片短名 */
const TYPE_PAGES: { path: string; title: string; card: string }[] = [
  { path: "/investments/stocks", title: "股票管理", card: "股票" },
  { path: "/investments/funds", title: "基金管理", card: "基金" },
  { path: "/investments/deposits", title: "定期管理", card: "定期" },
  { path: "/investments/bonds", title: "国债管理", card: "国债" },
  { path: "/investments/metals?sub=gold", title: "贵金属管理", card: "贵金属" },
  { path: "/investments/real-estate", title: "不动产管理", card: "不动产" },
  { path: "/investments/collectibles", title: "收藏品管理", card: "收藏品" },
  { path: "/investments/digital-assets", title: "数字资产管理", card: "数字资产" },
  { path: "/investments/insurance", title: "储蓄型保险", card: "储蓄型保险" },
  { path: "/investments/loans", title: "借贷管理", card: "借贷管理" },
];

/** 受限类型：种子库无对应类型账户（关联账户下拉为空），走新增表单渲染 + 必填校验拦截 */
const LIMITED_TYPES = ["stocks", "digital-assets", "collectibles", "insurance", "loans"];

test.describe("投资模块", () => {
  const stamp = Date.now();
  const fundName = `E2E基金${stamp}`;
  const fundEdited = `E2E基金改${stamp}`;

  test("投资总览：统计卡 + 10 类型入口 + 持仓明细空态", async ({ page }) => {
    await page.goto("/investments");
    await expect(page.locator("h1", { hasText: "投资总览" })).toBeVisible();
    for (const label of ["投资总资产", "累计投入", "累计收益", "持仓数量"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    for (const p of TYPE_PAGES) {
      // 限定页面内容区（div.grid）避免命中侧边栏同名「xx管理」链接；用路径前缀兼容 metals 的 sub 参数
      await expect(page.locator(`div.grid a[href^="${p.path.split("?")[0]}"]`)).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "投资资产分布" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "持仓明细" })).toBeVisible();
    await expect(page.getByText("暂无数据", { exact: true }).first()).toBeVisible();
  });

  test("各类型页面：标题 + 新增入口 + 空态 + 贵金属页签", async ({ page }) => {
    for (const p of TYPE_PAGES) {
      await page.goto(p.path);
      await expect(page.locator("h1", { hasText: p.title })).toBeVisible();
      await expect(page.locator('a[href*="/investments/new"]')).toBeVisible();
      await expect(page.getByText("暂无数据", { exact: true }).first()).toBeVisible();
    }
    // 贵金属黄金/白银页签
    await page.goto("/investments/metals?sub=gold");
    await expect(page.getByRole("button", { name: /黄金（0）/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /白银（0）/ })).toBeVisible();
  });

  test("受限类型：新增表单渲染 + 关联账户必填校验拦截", async ({ page }) => {
    for (const t of LIMITED_TYPES) {
      const pageCfg = TYPE_PAGES.find((p) => p.path.includes(t))!;
      await page.goto(pageCfg.path);
      await expect(page.locator("h1", { hasText: pageCfg.title })).toBeVisible();
      await page.locator('a[href*="/investments/new"]').first().click();
      await expect(page.locator("h1", { hasText: "新增" })).toBeVisible();
      // 关联账户下拉因无对应类型账户而只有「请选择」一项
      const acctSel = await fieldByLabel(page, "关联账户");
      await expect(acctSel).toBeVisible();
      await expect(acctSel.locator("option")).toHaveCount(1);
      // 填名称后保存，触发关联账户必填校验
      await fillIfVisible(page, "名称", `E2E${t}${stamp}`);
      // 校验链在「关联账户必填」之前还有类型特有的必填字段，需先填齐才能拦截到账户校验：
      // 股票类（stocks / digital-assets）：代码/数量/成本/市值/费用/买入日期
      if (t === "stocks" || t === "digital-assets") {
        await fillIfVisible(page, "代码", "E2ECODE");
        await fillIfVisible(page, "数量", "10");
        await fillIfVisible(page, "成本金额", "100.00");
        await fillIfVisible(page, "当前市值", "150.00");
        await fillIfVisible(page, "交易费用", "1.00");
        await fillIfVisible(page, "买入日期", "2026-09-01");
      }
      // 储蓄型保险：本金/市值/利率/起息日/到期日
      if (t === "insurance") {
        await fillIfVisible(page, "本金", "50000.00");
        await fillIfVisible(page, "当前市值", "52000.00");
        await fillIfVisible(page, "利率", "3.5");
        await fillIfVisible(page, "起息日", "2026-01-01");
        await fillIfVisible(page, "到期日", "2030-01-01");
      }
      // 收藏品：件数为必填
      if (t === "collectibles") {
        await fillIfVisible(page, "件数", "1");
      }
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page.getByText("请选择关联账户")).toBeVisible();
    }
  });

  test("基金：新增持仓", async ({ page }) => {
    await page.goto("/investments/funds");
    await expect(page.locator("h1", { hasText: "基金管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await expect(page.locator("h1", { hasText: "新增" })).toBeVisible();
    await fillIfVisible(page, "名称", fundName);
    await fillIfVisible(page, "代码", "E2E" + stamp);
    await fillIfVisible(page, "份额", "10");
    await fillIfVisible(page, "成本金额", "1000");
    await fillIfVisible(page, "当前市值", "1200");
    await fillIfVisible(page, "交易费用", "5");
    await fillIfVisible(page, "买入日期", "2026-01-01");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框（标题「保存持仓」）后点确认提交
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "基金管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: fundName })).toHaveCount(1);
  });

  test("基金：编辑持仓", async ({ page }) => {
    await page.goto("/investments/funds");
    const row = page.locator("tr", { hasText: fundName });
    await expect(row).toHaveCount(1);
    await row.getByRole("link", { name: "修改" }).click();
    await expect(page.locator("h1", { hasText: "修改" })).toBeVisible();
    await fillIfVisible(page, "名称", fundEdited);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框后点确认提交（编辑标题仍为「保存持仓」）
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "基金管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: fundEdited })).toHaveCount(1);
    await expect(page.locator("tr", { hasText: fundName })).toHaveCount(0);
  });

  test("基金：登记派息（action dialog）", async ({ page }) => {
    await page.goto("/investments/funds");
    const row = page.locator("tr", { hasText: fundEdited });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "派息" }).click();
    await expect(modal(page).getByRole("heading", { name: "登记派息" })).toBeVisible();
    // 基金有数量口径：先填「每股派息」自动带出派息金额（dividendQty 校验每股派息>0、派息股数<=上限）
    await fillIfVisible(page, "每股派息", "6.60");
    await clickModalOk(page, "派息");
    // 提交需二次确认：确认弹窗（第二个遮罩）嵌套在登记弹窗内部，取最后一个 modal
    const confirmModal = modal(page).last();
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole("button", { name: "派息", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator("tr", { hasText: fundEdited })).toHaveCount(1);
  });

  test("基金：卖出持仓（action dialog）", async ({ page }) => {
    await page.goto("/investments/funds");
    const row = page.locator("tr", { hasText: fundEdited });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "卖出" }).click();
    await expect(modal(page).getByRole("heading", { name: "卖出持仓" })).toBeVisible();
    await fillIfVisible(page, "成交金额", "1100.00");
    await clickModalOk(page, "卖出");
    // 二次确认弹窗（嵌套在登记弹窗内，取最后一个 modal）
    const sellConfirm = modal(page).last();
    await expect(sellConfirm).toBeVisible();
    await sellConfirm.getByRole("button", { name: "卖出", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
    // 已卖出持仓仍在列表中（仅隐藏卖出/派息按钮）
    await expect(page.locator("tr", { hasText: fundEdited })).toHaveCount(1);
  });

  test("基金：删除持仓", async ({ page }) => {
    await page.goto("/investments/funds");
    const row = page.locator("tr", { hasText: fundEdited });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tr", { hasText: fundEdited })).toHaveCount(0);
  });

  test("定期：新增、到期兑付、删除", async ({ page }) => {
    const name = `E2E定期${stamp}`;
    // 前置：种子库无「定期」类型账户（关联账户下拉为空），先创建 savings 账户（ACCOUNT_TYPES index 4）
    await ensureAccount(page, `${name}账户`, 4);
    // 回到定期页新增持仓
    await page.goto("/investments/deposits");
    await expect(page.locator("h1", { hasText: "定期管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await fillIfVisible(page, "名称", name);
    await fillIfVisible(page, "本金", "5000");
    await fillIfVisible(page, "当前市值", "5200");
    await fillIfVisible(page, "利率", "2.5");
    await fillIfVisible(page, "起息日", "2026-01-01");
    await fillIfVisible(page, "到期日", "2027-01-01");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框后点确认提交
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "定期管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
    // 到期兑付
    const row = page.locator("tr", { hasText: name });
    await row.getByRole("button", { name: "到期" }).click();
    await expect(modal(page).getByRole("heading", { name: "到期兑付" })).toBeVisible();
    // 到期兑付：本金 + 利息分栏录入（splitAmount 无单一金额框），合计 = 到账金额
    await fillIfVisible(page, "本金", "5000.00");
    await fillIfVisible(page, "利息", "200.00");
    await clickModalOk(page, "到期");
    // 二次确认弹窗（嵌套在登记弹窗内，取最后一个 modal）
    const maturityConfirm = modal(page).last();
    await expect(maturityConfirm).toBeVisible();
    await maturityConfirm.getByRole("button", { name: "到期", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
    // 删除
    await page.locator("tr", { hasText: name }).getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  });

  test("国债：新增并删除", async ({ page }) => {
    const name = `E2E国债${stamp}`;
    // 前置：创建 bond（国债）类型账户（ACCOUNT_TYPES index 8）
    await ensureAccount(page, `${name}账户`, 8);
    await page.goto("/investments/bonds");
    await expect(page.locator("h1", { hasText: "国债管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await fillIfVisible(page, "名称", name);
    await fillIfVisible(page, "本金", "3000");
    await fillIfVisible(page, "当前市值", "3100");
    await fillIfVisible(page, "利率", "2.8");
    await fillIfVisible(page, "起息日", "2026-02-01");
    await fillIfVisible(page, "到期日", "2028-02-01");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框后点确认提交
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "国债管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
    await page.locator("tr", { hasText: name }).getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  });

  test("贵金属：黄金新增、删除、页签", async ({ page }) => {
    const name = `E2E黄金${stamp}`;
    // 前置：创建 precious_metal（贵金属）类型账户（ACCOUNT_TYPES index 7）
    await ensureAccount(page, `${name}账户`, 7);
    await page.goto("/investments/metals?sub=gold");
    await expect(page.locator("h1", { hasText: "贵金属管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await fillIfVisible(page, "名称", name);
    await fillIfVisible(page, "克数", "10");
    await fillIfVisible(page, "成本金额", "6000");
    await fillIfVisible(page, "当前市值", "6500");
    await fillIfVisible(page, "交易费用", "10");
    await fillIfVisible(page, "买入日期", "2026-03-01");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框后点确认提交
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "贵金属管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
    // 黄金页签计数 +1
    await expect(page.getByRole("button", { name: /黄金（1）/ })).toBeVisible();
    // 删除
    await page.locator("tr", { hasText: name }).getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /黄金（0）/ })).toBeVisible();
    // 白银页签可切换
    await page.getByRole("button", { name: /白银（0）/ }).click();
    await expect(page).toHaveURL(/sub=silver/);
  });

  test("不动产：新增并删除", async ({ page }) => {
    const name = `E2E房产${stamp}`;
    // 前置：创建 real_estate（不动产）类型账户（ACCOUNT_TYPES index 10）
    await ensureAccount(page, `${name}账户`, 10);
    await page.goto("/investments/real-estate");
    await expect(page.locator("h1", { hasText: "不动产管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await fillIfVisible(page, "名称", name);
    await fillIfVisible(page, "成本金额", "2000000");
    await fillIfVisible(page, "当前估值", "2200000");
    await fillIfVisible(page, "买入日期", "2026-04-01");
    await fillIfVisible(page, "地址", "北京市朝阳区");
    await fillIfVisible(page, "面积", "88");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 弹确认框后点确认提交
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("h1", { hasText: "不动产管理" })).toBeVisible();
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
    await page.locator("tr", { hasText: name }).getByRole("button", { name: "删除" }).click();
    await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
    await clickModalOk(page, "删除");
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  });

  test("基金：复制持仓（确认框 → 生成同源新持仓 + 买入流水）", async ({ page }) => {
    const name = `E2E复制${stamp}`;
    // 新增一条 active 持仓
    await page.goto("/investments/funds");
    await expect(page.locator("h1", { hasText: "基金管理" })).toBeVisible();
    await page.locator('a[href*="/investments/new"]').click();
    await fillIfVisible(page, "名称", name);
    await fillIfVisible(page, "代码", "CPY");
    await fillIfVisible(page, "份额", "10");
    await fillIfVisible(page, "成本金额", "1000");
    await fillIfVisible(page, "当前市值", "1200");
    await fillIfVisible(page, "交易费用", "5");
    await fillIfVisible(page, "买入日期", "2026-01-01");
    await fillIfVisible(page, "关联账户", "", "select");
    await fillIfVisible(page, "扣款账户", "", "select", 2);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(modal(page).getByRole("heading", { name: "保存持仓" })).toBeVisible();
    await clickModalOk(page, "保存");
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);

    // 行内「复制」：确认框 → 确认后生成一条名称带「（副本）」的新持仓
    const row = page.locator("tr", { hasText: name });
    await row.getByRole("button", { name: "复制" }).click();
    await expect(modal(page).getByRole("heading", { name: "复制持仓" })).toBeVisible();
    await clickModalOk(page, "复制");
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator("tr", { hasText: `${name}（副本）` })).toHaveCount(1);

    // 清理：删除原持仓与复制持仓
    for (const n of [name, `${name}（副本）`]) {
      const r = page.locator("tr", { hasText: n });
      await r.getByRole("button", { name: "删除" }).click();
      await expect(modal(page).getByRole("heading", { name: "删除投资" })).toBeVisible();
      await clickModalOk(page, "删除");
    }
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  });
});
