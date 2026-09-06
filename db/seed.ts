/**
 * ratcount · 演示数据种子（对齐原型演示口径）
 * 用法：npm run db:seed
 */
import { db } from "../lib/db";
import {
  users, ledgers, ledgerMembers, currencies, accounts, categories,
  tags, projects, transactions, transactionTags, balances, settings,
} from "../db/schema";
import bcrypt from "bcryptjs";

async function main() {
  // 幂等：先清空（无外键约束，按逆依赖顺序删除）
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

  // 1) 管理员用户 admin@example.com / demo1234
  const [admin] = await db.insert(users).values({
    email: "admin@example.com",
    passwordHash: await bcrypt.hash("demo1234", 12),
    name: "管理员",
    role: "admin",
  }).returning();

  // 2) 家庭账本
  const [ledger] = await db.insert(ledgers).values({
    name: "家庭账本",
    icon: "📒",
    baseCurrencyCode: "CNY",
    createdBy: admin.id,
  }).returning();

  // 3) 账本成员
  await db.insert(ledgerMembers).values({
    ledgerId: ledger.id, userId: admin.id, role: "owner",
  });

  // 3.5) 全局设置（settings 表，user_id='global' = 全局项，带显示名）
  await db.insert(settings).values([
    { name: "程序名称", key: "app_name", value: "ratcount", userId: "global", updatedBy: admin.id },
    { name: "默认语言", key: "default_locale", value: "zh", userId: "global", updatedBy: admin.id },
    { name: "允许注册", key: "allow_registration", value: "true", userId: "global", updatedBy: admin.id },
    { name: "登录验证码", key: "enable_login_captcha", value: "true", userId: "global", updatedBy: admin.id },
    { name: "日志保留天数", key: "audit_log_retention_days", value: "90", userId: "global", updatedBy: admin.id },
    { name: "版权信息", key: "copyright", value: "© 2026 ratcount · 本地与 Turso 双部署", userId: "global", updatedBy: admin.id },
  ]);

  // 4) 币种（CNY 基准）
  const currencyRows = [
    { code: "CNY", symbol: "¥", nameZh: "人民币", nameEn: "CNY", rate: "1", isBase: true },
    { code: "USD", symbol: "$", nameZh: "美元", nameEn: "USD", rate: "7.2", isBase: false },
    { code: "EUR", symbol: "€", nameZh: "欧元", nameEn: "EUR", rate: "7.8", isBase: false },
    { code: "JPY", symbol: "¥", nameZh: "日元", nameEn: "JPY", rate: "0.048", isBase: false },
    { code: "HKD", symbol: "HK$", nameZh: "港币", nameEn: "HKD", rate: "0.92", isBase: false },
    { code: "GBP", symbol: "£", nameZh: "英镑", nameEn: "GBP", rate: "9.1", isBase: false },
  ].map((c) => ({ ...c, isActive: true, sort: 0 }));
  await db.insert(currencies).values(currencyRows);

  // 5) 账户（opening = 期初；实时余额 = 期初 + 流水；opening 已按"含 09-02 现金→招行转账 5000"对齐原型）
  const [cash, cmb, credit, wechat, stock, usd, bond, gold] = await db.insert(accounts).values([
    // 现金 opening = 200（当前 = 200 + 8000 奶茶店进账 − 5000 转出 = 3200，对齐原型）
    { ledgerId: ledger.id, name: "现金", type: "cash", icon: "💵", openingBalanceCents: 20000, isAsset: true, createdBy: admin.id },
    // 招行储蓄 opening = 95806（当前 = 95806 + 20000 − 486 − 1860 + 5000 = 118460，对齐原型）
    { ledgerId: ledger.id, name: "招行储蓄卡", type: "debit_card", icon: "🏦", openingBalanceCents: 9580600, isAsset: true, createdBy: admin.id },
    { ledgerId: ledger.id, name: "招行信用卡", type: "credit_card", icon: "💳", openingBalanceCents: -486000, isAsset: false, createdBy: admin.id },
    { ledgerId: ledger.id, name: "微信", type: "wechat", icon: "💬", openingBalanceCents: 645200, isAsset: true, createdBy: admin.id },
    { ledgerId: ledger.id, name: "A股账户", type: "investment", icon: "📈", openingBalanceCents: 15200000, isAsset: true, createdBy: admin.id },
    { ledgerId: ledger.id, name: "美元账户", type: "foreign_currency", icon: "🌐", currencyCode: "USD", openingBalanceCents: 120000, isAsset: true, createdBy: admin.id },
    { ledgerId: ledger.id, name: "国债", type: "bond", icon: "🛡️", openingBalanceCents: 8000000, isAsset: true, createdBy: admin.id },
    { ledgerId: ledger.id, name: "黄金定投", type: "precious_metal", icon: "💎", openingBalanceCents: 2644000, isAsset: true, createdBy: admin.id },
  ]).returning();

  // 6) 分类
  const cats = await db.insert(categories).values([
    { ledgerId: ledger.id, name: "工资", type: "income", icon: "💰" },
    { ledgerId: ledger.id, name: "生意进账", type: "income", icon: "🧋" },
    { ledgerId: ledger.id, name: "投资收益", type: "income", icon: "📈" },
    { ledgerId: ledger.id, name: "其他收入", type: "income", icon: "📦" },
    { ledgerId: ledger.id, name: "房贷", type: "expense", icon: "🏠" },
    { ledgerId: ledger.id, name: "宝宝", type: "expense", icon: "👶" },
    { ledgerId: ledger.id, name: "餐饮", type: "expense", icon: "🍚" },
    { ledgerId: ledger.id, name: "医疗", type: "expense", icon: "🏥" },
    { ledgerId: ledger.id, name: "交通", type: "expense", icon: "🚗" },
    { ledgerId: ledger.id, name: "教育", type: "expense", icon: "📚" },
    { ledgerId: ledger.id, name: "娱乐", type: "expense", icon: "🎬" },
    { ledgerId: ledger.id, name: "其他", type: "expense", icon: "📦" },
  ]).returning();
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c]));

  // 7) 标签
  const tagRows = await db.insert(tags).values([
    { ledgerId: ledger.id, name: "宝宝", color: "#EA6668" },
    { ledgerId: ledger.id, name: "康复", color: "#C9A7E8" },
    { ledgerId: ledger.id, name: "出差", color: "#F4B393" },
    { ledgerId: ledger.id, name: "房贷", color: "#8BC8EA" },
    { ledgerId: ledger.id, name: "投资", color: "#A2DDAA" },
  ]).returning();
  const tagMap = Object.fromEntries(tagRows.map((t) => [t.name, t]));

  // 8) 项目
  const [milkTea, babyPlan] = await db.insert(projects).values([
    { ledgerId: ledger.id, name: "奶茶店", icon: "🧋", budgetCents: 5000000, status: "active", createdBy: admin.id },
    { ledgerId: ledger.id, name: "宝贝计划", icon: "👶", budgetCents: 1500000, status: "completed", createdBy: admin.id },
  ]).returning();

  // 9) 当月流水
  const txRows = await db.insert(transactions).values([
    { ledgerId: ledger.id, accountId: cmb.id, type: "income", categoryId: catMap["工资"].id, amountCents: 2000000, txDate: "2026-09-03", remark: "9 月工资到账", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: cmb.id, type: "expense", categoryId: catMap["餐饮"].id, amountCents: 48600, txDate: "2026-09-04", remark: "山姆会员店 · 周末采购", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: cmb.id, type: "expense", categoryId: catMap["医疗"].id, projectId: babyPlan.id, amountCents: 186000, txDate: "2026-09-02", remark: "康复机构 · 月费", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: wechat.id, type: "expense", categoryId: catMap["餐饮"].id, amountCents: 3200, txDate: "2026-09-01", remark: "楼下小馆 午餐", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: cash.id, type: "income", categoryId: catMap["生意进账"].id, projectId: milkTea.id, amountCents: 800000, txDate: "2026-09-02", remark: "奶茶店 周流水", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: cash.id, type: "transfer", toAccountId: cmb.id, amountCents: 500000, txDate: "2026-09-02", remark: "现金 → 招行储蓄卡", createdBy: admin.id },
  ]).returning();

  // 10) 流水标签
  const [sam, rehab] = txRows;
  await db.insert(transactionTags).values([
    { transactionId: sam.id, tagId: tagMap["宝宝"].id },
    { transactionId: rehab.id, tagId: tagMap["宝宝"].id },
    { transactionId: rehab.id, tagId: tagMap["康复"].id },
  ]);

  // 11) 余额快照（09-01 时点；现金快照与当前差 50 元 → 演示"待对账"）
  await db.insert(balances).values([
    { ledgerId: ledger.id, accountId: cash.id, balanceAmountCents: 315000, snapshotDate: "2026-09-01", remark: "快照差异 -50 元待核对", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: cmb.id, balanceAmountCents: 9580600, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: credit.id, balanceAmountCents: -486000, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: wechat.id, balanceAmountCents: 645200, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: stock.id, balanceAmountCents: 15200000, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: usd.id, balanceAmountCents: 120000, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: bond.id, balanceAmountCents: 8000000, snapshotDate: "2026-09-01", createdBy: admin.id },
    { ledgerId: ledger.id, accountId: gold.id, balanceAmountCents: 2644000, snapshotDate: "2026-09-01", createdBy: admin.id },
  ]);

  console.log(`✅ 种子完成：用户 admin@example.com / demo1234，账本「${ledger.name}」，8 账户、${txRows.length} 条流水`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("❌ 种子失败", e); process.exit(1); });
