/**
 * E2E 种子数据：为独立 E2E 库写入最小可用数据集
 * - 1 个 admin 用户（admin@example.com / demo1234）
 * - 2 个账本（供「账本切换」用例）：E2E演示账本、出差账本
 * - 3 个账户（现金/工资卡/基金）+ 支出/收入分类（供「记一笔」用例）
 * - 2 条当月流水（供仪表盘/报表渲染）
 * - 全局设置：关闭登录验证码、开放注册
 */
import bcrypt from "bcryptjs";
import { ledgers, ledgerMembers, accounts, categories, transactions, transactionTags, balances, projects, tags, currencies, settings, users, auditLogs, menuGroups, menus, userMenuConfig, languages, userProfiles } from "../../db/schema"
import { GLOBAL_USER_ID, DEFAULT_LEDGER_ICON, DEFAULT_LANGUAGE, ACCT, TX } from "../../lib/constants"
import { MENU_GROUP_DEFS, MENU_DEFS, ACTIVE_MENU_IDS } from "../../db/init/01-menus"
import { LANGUAGE_DEFS } from "../../db/init/02-settings"


import { db } from "../../lib/db";





async function main() {
  // 幂等清空（顺序对齐 db/seed.ts：逆依赖顺序删除，避免残留）
  await db.delete(userMenuConfig);
  await db.delete(menus);
  await db.delete(menuGroups);
  await db.delete(languages);
  await db.delete(userProfiles);
  await db.delete(auditLogs);
  await db.delete(transactionTags);
  await db.delete(balances);
  await db.delete(transactions);
  await db.delete(projects);
  await db.delete(tags);
  await db.delete(categories);
  await db.delete(accounts);
  await db.delete(currencies);
  await db.delete(ledgerMembers);
  await db.delete(ledgers);
  await db.delete(settings);
  await db.delete(users);

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("demo1234", 12),
      name: "E2E管理员",
      role: "admin",
    })
    .returning();

  // E2E 用户偏好（个人中心 bio 渲染依赖 user_profiles 行）
  await db.insert(userProfiles).values({
    userId: admin.id,
    localeCode: DEFAULT_LANGUAGE,
    timezoneCode: "Asia/Shanghai",
    bio: "E2E 管理员",
  });

  // E2E 审计日志（供 logs.spec.ts：搜索锚点 AnchorLog*、请求/响应体展开）
  await db.insert(auditLogs).values([
    { userId: admin.id, action: "C", entity: "currency", entityId: admin.id, summary: "种子日志-新增币种 AnchorLogCreate", requestBody: '{"code":"TST","rate":2.5}', responseBody: '{"ok":true,"id":"seed-1"}' },
    { userId: admin.id, action: "U", entity: "menu", entityId: admin.id, summary: "种子日志-更新菜单 AnchorLogUpdate", requestBody: '{"name":"E2E菜单"}', responseBody: '{"ok":true,"id":"seed-2"}' },
    { userId: admin.id, action: "D", entity: "transaction", entityId: admin.id, summary: "种子日志-删除流水 AnchorLogDelete", requestBody: '{"id":"tx-seed"}', responseBody: '{"ok":true,"id":"seed-3"}' },
  ]);

  const [ledgerA] = await db
    .insert(ledgers)
    .values({ name: "E2E演示账本", icon: DEFAULT_LEDGER_ICON, baseCurrencyCode: "CNY", createdBy: admin.id })
    .returning();
  const [ledgerB] = await db
    .insert(ledgers)
    .values({ name: "出差账本", icon: "✈️", baseCurrencyCode: "CNY", createdBy: admin.id })
    .returning();

  await db.insert(ledgerMembers).values([
    { ledgerId: ledgerA.id, userId: admin.id, role: "owner" },
    { ledgerId: ledgerB.id, userId: admin.id, role: "owner" },
  ]);

  // 菜单分组 + 菜单目录（导航唯一数据源：侧边栏/底部 tab/个人中心卡片均依赖）
  await db.insert(menuGroups).values(MENU_GROUP_DEFS);
  await db.insert(menus).values(MENU_DEFS);

  // 语言清单（/settings/languages 语言管理用例依赖）
  await db.insert(languages).values(LANGUAGE_DEFS);

  // 用户菜单配置：为 admin 在两个账本启用全部 active 菜单
  await db.insert(userMenuConfig).values(
    ACTIVE_MENU_IDS.flatMap((menuId) => [
      { ledgerId: ledgerA.id, userId: admin.id, menuId },
      { ledgerId: ledgerB.id, userId: admin.id, menuId },
    ]),
  );

  const [cash, salaryCard] = await db
    .insert(accounts)
    .values([
      { ledgerId: ledgerA.id, name: "现金", type: "cash", icon: "💵", openingBalanceCents: 0, isAsset: true, createdBy: admin.id },
      { ledgerId: ledgerA.id, name: "工资卡", type: ACCT.debit_card, icon: "🏦", openingBalanceCents: 0, isAsset: true, createdBy: admin.id },
      { ledgerId: ledgerA.id, name: "基金账户", type: ACCT.fund, icon: "📈", openingBalanceCents: 0, isAsset: true, createdBy: admin.id },
    ])
    .returning();

  const [salaryCat, foodCat, trafficCat] = await db
    .insert(categories)
    .values([
      { ledgerId: ledgerA.id, name: "工资", type: TX.income, icon: "💰" },
      { ledgerId: ledgerA.id, name: "餐饮", type: TX.expense, icon: "🍚" },
      { ledgerId: ledgerA.id, name: "交通", type: TX.expense, icon: "🚗" },
    ])
    .returning();

  const today = new Date().toISOString().slice(0, 10);
  await db.insert(transactions).values([
    { ledgerId: ledgerA.id, accountId: salaryCard.id, type: TX.income, categoryId: salaryCat.id, amountCents: 10000000, txDate: today, remark: "工资入账", createdBy: admin.id },
    { ledgerId: ledgerA.id, accountId: cash.id, type: TX.expense, categoryId: foodCat.id, amountCents: 200000, txDate: today, remark: "餐饮开销", createdBy: admin.id },
  ]);

  await db.insert(settings).values([
    { name: "允许注册", key: "allow_registration", value: "true", userId: GLOBAL_USER_ID, updatedBy: admin.id },
    { name: "登录验证码", key: "enable_login_captcha", value: "false", userId: GLOBAL_USER_ID, updatedBy: admin.id },
  ]);

  // eslint-disable-next-line no-console
  console.log("[e2e-seed] 完成：admin@example.com / demo1234，账本 x2，流水 x2");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[e2e-seed] 失败", e);
    process.exit(1);
  });
