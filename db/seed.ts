/**
 * money · 演示数据种子（对齐原型演示口径）/ Demo data seed (aligned with the prototype)
 * 用法：npm run db:seed / Usage: npm run db:seed
 */
import { ledgers, ledgerMembers, currencies, accounts, categories, tags, projects, transactions, transactionTags, balances, settings, investmentHoldings, holdingTags, recurringPlans, auditLogs, menuGroups, menus, userMenuConfig, languages, users } from "../db/schema"
import { GLOBAL_USER_ID, DEFAULT_CURRENCY, DEFAULT_LEDGER_ICON, TX } from "../lib/constants"


import { db } from "../lib/db";
import { convertCents } from "../lib/money";
import { eq } from "drizzle-orm";




import bcrypt from "bcryptjs";
import { acctDefs } from "./seeds/accounts";
import { HIST_TX } from "./seeds/transactions";
import { CAT_DEFS } from "./seeds/categories";
import { TAG_DEFS } from "./seeds/tags";
import { PROJECT_DEFS } from "./seeds/projects";
import { HOLDING_DEFS, HOLDING_TAG_DEFS } from "./seeds/investments";
import { SETTING_DEFS, CURRENCY_DEFS, LANGUAGE_DEFS } from "./init/02-settings";
import { MENU_GROUP_DEFS, MENU_DEFS, ACTIVE_MENU_IDS } from "./init/01-menus";
import { RECURRING_DEFS, BALANCE_DEFS, AUDIT_LOG_DEFS } from "./seeds/extra";
import { type AcctKey } from "./seeds/types";

async function main() {
  // 安全守门：禁止在生产环境执行种子（会清空全部数据表），staging/prod 直接拒绝 / Safety gate: refuse to run in production (it wipes all tables); staging/prod rejected outright
  if (process.env.NODE_ENV === "production") {
    console.error("❌ 拒绝执行：db:seed 会清空数据并写入演示数据，仅允许在非生产环境运行");
    process.exit(1);
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "demo1234";

  // 确保 schema 最新（含 buy_transaction_id 等增量列迁移，幂等）：本地库会按需要 ALTER 加列 / Ensure latest schema (incl. incremental column migrations; idempotent)
  const { ensureSchema } = await import("../lib/db/bootstrap");
  await ensureSchema();

  // 幂等：先清空（无外键约束，按逆依赖顺序删除）/ Idempotent: wipe first (no FK constraints; delete in reverse dependency order)
  await db.delete(userMenuConfig);
  await db.delete(menus);
  await db.delete(menuGroups);
  await db.delete(transactionTags);
  await db.delete(holdingTags); // 持仓标签关联（无 ledgerId，须随持仓一起清空，避免孤儿行）/ Holding tag links (no ledgerId; cleared with holdings to avoid orphan rows)
  await db.delete(investmentHoldings);
  await db.delete(recurringPlans);
  await db.delete(auditLogs);
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
  await db.delete(languages);

  // 1) 管理员用户 / Admin user
  const [admin] = await db.insert(users).values({
    email: "admin@example.com",
    passwordHash: await bcrypt.hash(adminPassword, 12),
    name: "管理员",
    role: "admin",
  }).returning();

  // 2) 家庭账本 / Family ledger
  const [ledger] = await db.insert(ledgers).values({
    name: "家庭账本",
    icon: DEFAULT_LEDGER_ICON,
    baseCurrencyCode: DEFAULT_CURRENCY,
    createdBy: admin.id,
  }).returning();

  // 3) 账本成员 / Ledger members
  await db.insert(ledgerMembers).values({
    ledgerId: ledger.id, userId: admin.id, role: "owner",
  });

  // 3.5) 全局设置 / Global settings
  await db.insert(settings).values(
    SETTING_DEFS.map((s) => ({ ...s, userId: GLOBAL_USER_ID, updatedBy: admin.id })),
  );

  // 3.6) 语言表 / Languages
  await db.insert(languages).values(LANGUAGE_DEFS);

  // 4) 币种 / Currencies
  await db.insert(currencies).values(CURRENCY_DEFS);

  // 4.2) 菜单分组 / Menu groups
  await db.insert(menuGroups).values(MENU_GROUP_DEFS);

  // 4.3) 菜单目录 / Menu catalog
  await db.insert(menus).values(MENU_DEFS);

  // 4.4) 为用户启用全部 active 菜单 / Enable all active menus for the user
  await db.insert(userMenuConfig).values(
    ACTIVE_MENU_IDS.map((menuId) => ({ ledgerId: ledger.id, userId: admin.id, menuId })),
  );

  // 多币种快照辅助：种子按「原币」存金额，并快照 usedRate / base*，与运行期服务口径一致
  // Multi-currency snapshot helpers: seed stores native amounts + snapshots usedRate/base* (matches runtime services)
  const rateMap = new Map(CURRENCY_DEFS.map((c) => [c.code, c.rate]));
  const acctCurrencyByKey: Record<string, string> = {};
  for (const a of acctDefs) acctCurrencyByKey[a.key] = a.currencyCode ?? "CNY";
  const acctKeyByName: Record<string, string> = {};
  for (const a of acctDefs) acctKeyByName[a.name] = a.key;

  // 5) 账户（opening = 目标余额 − 历史流水净额）/ Accounts (opening = target balance − historical tx net delta)
  const acctRows = await db.insert(accounts).values(
    acctDefs.map((a) => ({
      ledgerId: ledger.id,
      name: a.name,
      type: a.type,
      icon: a.icon,
      currencyCode: a.currencyCode ?? DEFAULT_CURRENCY,
      openingBalanceCents: a.openingBalanceCents,
      // 基准期初 = 原币期初 × 汇率（外币账户按此折算，与运行期 convertCents 口径一致）/ base opening = native × rate (same as runtime convertCents)
      baseOpeningBalanceCents: a.baseOpeningBalanceCents ?? convertCents(a.openingBalanceCents, rateMap.get(a.currencyCode ?? "CNY") ?? "1", "1"),
      isAsset: a.isAsset,
      createdBy: admin.id,
    })),
  ).returning();
  const acctIdByKey = Object.fromEntries(
    acctRows.map((r) => [r.name, r.id]),
  ) as Record<string, string>;
  const acctId = (name: string) => acctIdByKey[name];

  /** 计算一笔流水的币种快照字段（原币代码 + 目标币种 + 汇率 + 目标金额 + 基准金额）/ Resolve currency snapshot fields for one tx */
  function txCurrencyFields(fromKey: string, toKey: string | null, type: string, amountCents: number) {
    const fromCur = acctCurrencyByKey[fromKey] ?? "CNY";
    const toCur = toKey ? (acctCurrencyByKey[toKey] ?? "CNY") : fromCur;
    const fromRate = rateMap.get(fromCur) ?? "1";
    const toRate = rateMap.get(toCur) ?? "1";
    const isTransfer = type === "transfer" && !!toKey;
    return {
      currencyCode: fromCur,
      toCurrencyCode: toKey ? toCur : null,
      usedRateFrom: fromRate,
      usedRateTo: isTransfer ? toRate : null,
      toAmountCents: isTransfer ? convertCents(amountCents, fromRate, toRate) : null,
      baseAmountCents: convertCents(amountCents, fromRate, "1"),
    };
  }
  /** 同名封装：直接按账户名取币种 / name-based wrapper of txCurrencyFields */
  function txCurByName(name: string, toName: string | null, type: string, amountCents: number) {
    return txCurrencyFields(acctKeyByName[name] ?? "", toName ? (acctKeyByName[toName] ?? "") : null, type, amountCents);
  }

  // 6) 分类 / Categories
  const cats = await db.insert(categories).values(
    CAT_DEFS.map((c) => ({ ledgerId: ledger.id, name: c.name, type: c.type, icon: c.icon })),
  ).returning();
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c]));

  // 7) 标签 / Tags
  const tagRows = await db.insert(tags).values(
    TAG_DEFS.map((t) => ({ ledgerId: ledger.id, name: t.name, color: t.color })),
  ).returning();
  const tagMap = Object.fromEntries(tagRows.map((t) => [t.name, t]));

  // 8) 项目 / Projects
  const projRows = await db.insert(projects).values(
    PROJECT_DEFS.map((p) => ({
      ledgerId: ledger.id, name: p.name, icon: p.icon,
      budgetCents: p.budgetCents, status: p.status, createdBy: admin.id,
    })),
  ).returning();
  const projMap: Record<string, string> = Object.fromEntries(
    projRows.map((p) => [p.name, p.id]),
  );

  // 9) 当月流水（2026-09）/ Current-month transactions (2026-09)
  const txRows = await db.insert(transactions).values([
    { ledgerId: ledger.id, accountId: acctId("招行储蓄卡"), type: "income",  categoryId: catMap["工资"].id,         amountCents: 2000000, txDate: "2026-09-03", remark: "9 月工资到账",                    createdBy: admin.id, ...txCurByName("招行储蓄卡", null, "income", 2000000) },
    { ledgerId: ledger.id, accountId: acctId("招行储蓄卡"), type: "expense", categoryId: catMap["餐饮"].id,          amountCents: 48600,   txDate: "2026-09-04", remark: "山姆会员店 · 周末采购",            createdBy: admin.id, ...txCurByName("招行储蓄卡", null, "expense", 48600) },
    { ledgerId: ledger.id, accountId: acctId("招行储蓄卡"), type: "expense", categoryId: catMap["医疗"].id,          amountCents: 186000,  txDate: "2026-09-02", remark: "康复机构 · 月费", projectId: projMap["宝贝计划"], createdBy: admin.id, ...txCurByName("招行储蓄卡", null, "expense", 186000) },
    { ledgerId: ledger.id, accountId: acctId("微信"),       type: "expense", categoryId: catMap["餐饮"].id,          amountCents: 3200,    txDate: "2026-09-01", remark: "楼下小馆 午餐",                    createdBy: admin.id, ...txCurByName("微信", null, "expense", 3200) },
    { ledgerId: ledger.id, accountId: acctId("现金"),       type: "income",  categoryId: catMap["生意进账"].id,      amountCents: 800000,  txDate: "2026-09-02", remark: "奶茶店 周流水", projectId: projMap["奶茶店"],    createdBy: admin.id, ...txCurByName("现金", null, "income", 800000) },
    { ledgerId: ledger.id, accountId: acctId("现金"),       type: "transfer", toAccountId: acctId("招行储蓄卡"), amountCents: 500000,  txDate: "2026-09-02", remark: "现金 → 招行储蓄卡",                createdBy: admin.id, ...txCurByName("现金", "招行储蓄卡", "transfer", 500000) },
    { ledgerId: ledger.id, accountId: acctId("招行储蓄卡"), type: "expense", categoryId: catMap["消费型保险"].id,    amountCents: 380000,  txDate: "2026-09-05", remark: "重疾险 · 年缴保费",                createdBy: admin.id, ...txCurByName("招行储蓄卡", null, "expense", 380000) },
    { ledgerId: ledger.id, accountId: acctId("招行储蓄卡"), type: "transfer", toAccountId: acctId("公积金账户"),  amountCents: 120000,  txDate: "2026-09-10", remark: "公积金缴存 · 月缴",                createdBy: admin.id, ...txCurByName("招行储蓄卡", "公积金账户", "transfer", 120000) },
  ]).returning();

  // 9.5) 历史流水（2026-03 ~ 2026-08）/ Historical transactions (2026-03 ~ 2026-08)
  const histTxRows = await db.insert(transactions).values(
    HIST_TX.map((t) => {
      const amountCents = Math.round(t.yuan * 100);
      return {
        ledgerId: ledger.id,
        accountId: acctIdByKey[acctDefs.find((a) => a.key === t.acct)!.name],
        toAccountId: t.toAcct ? acctIdByKey[acctDefs.find((a) => a.key === t.toAcct)!.name] ?? null : null,
        type: t.type,
        categoryId: t.cat ? catMap[t.cat]?.id ?? null : null,
        projectId: t.project ? projMap[t.project] ?? null : null,
        amountCents,
        txDate: t.date,
        remark: t.remark,
        createdBy: admin.id,
        ...txCurrencyFields(t.acct, t.toAcct ?? null, t.type, amountCents),
      };
    }),
  ).returning();

  // 10) 流水标签 / Transaction tags
  const txIdByRemark = (remark: string) => txRows.find((r) => r.remark === remark)?.id;
  const histId = (remark: string) => histTxRows.find((r) => r.remark === remark)?.id;
  await db.insert(transactionTags).values([
    { transactionId: txIdByRemark("山姆会员店 · 周末采购")!, tagId: tagMap["宝宝"].id },
    { transactionId: txIdByRemark("康复机构 · 月费")!,      tagId: tagMap["宝宝"].id },
    { transactionId: txIdByRemark("康复机构 · 月费")!,      tagId: tagMap["康复"].id },
    { transactionId: histId("出差 · 上海往返机票")!,        tagId: tagMap["出差"].id },
    { transactionId: histId("暑期旅行 · 酒店")!,            tagId: tagMap["出差"].id },
    { transactionId: histId("8 月房贷扣款")!,               tagId: tagMap["房贷"].id },
    { transactionId: histId("基金定投 · 转入 A股账户")!,    tagId: tagMap["投资"].id },
    { transactionId: histId("黄金 ETF 分红")!,              tagId: tagMap["投资"].id },
    { transactionId: txIdByRemark("重疾险 · 年缴保费")!,    tagId: tagMap["保险"].id },
    { transactionId: txIdByRemark("公积金缴存 · 月缴")!,    tagId: tagMap["公积金"].id },
  ]);

  // 11) 余额快照（09-01 时点）/ Balance snapshots (as of 09-01)
  await db.insert(balances).values(
    BALANCE_DEFS.map((b) => {
      const cur = acctCurrencyByKey[b.accountId] ?? "CNY";
      const rate = rateMap.get(cur) ?? "1";
      return {
        ledgerId: ledger.id,
        accountId: acctIdByKey[acctDefs.find((a) => a.key === b.accountId)!.name],
        balanceAmountCents: b.balanceAmountCents,
        snapshotDate: b.snapshotDate,
        remark: b.remark ?? null,
        createdBy: admin.id,
        currencyCode: cur,
        usedRate: rate,
        baseBalanceAmountCents: convertCents(b.balanceAmountCents, rate, "1"),
      };
    }),
  );

  // 12) 投资持仓 / Investment holdings
  const holdingRows = await db.insert(investmentHoldings).values(
    HOLDING_DEFS.map((h) => {
      const cur = acctCurrencyByKey[h.accountId] ?? "CNY";
      const rate = rateMap.get(cur) ?? "1";
      const def: typeof investmentHoldings.$inferInsert = {
        ledgerId: ledger.id,
        createdBy: admin.id,
        type: h.type,
        name: h.name,
        accountId: acctIdByKey[acctDefs.find((a) => a.key === h.accountId)!.name],
        paymentAccountId: acctIdByKey[acctDefs.find((a) => a.key === h.paymentAccountId)!.name],
        quantity: h.quantity,
        costCents: h.costCents,
        feeCents: h.feeCents,
        currentValueCents: h.currentValueCents,
        purchaseDate: h.purchaseDate,
        status: h.status,
        remark: h.remark,
        currencyCode: cur,
        usedRate: rate,
        baseCostCents: convertCents(h.costCents, rate, "1"),
        baseFeeCents: convertCents(h.feeCents, rate, "1"),
        baseValueCents: convertCents(h.currentValueCents, rate, "1"),
        baseDividendCents: 0,
      };
      if (h.code) def.code = h.code;
      if (h.maturityDate) def.maturityDate = h.maturityDate;
      if (h.interestRate) def.interestRate = h.interestRate;
      if (h.subType) def.subType = h.subType;
      if (h.location) def.location = h.location;
      if (h.areaSqm) def.areaSqm = h.areaSqm;
      if (h.direction) def.direction = h.direction;
      return def;
    }),
  ).returning({ id: investmentHoldings.id, name: investmentHoldings.name });

  // 持仓名 → id 映射（买入流水回写 + 持仓标签共用）/ name → id map (shared by buy-flow writeback + holding tags)
  const holdingIdByName: Record<string, string> = Object.fromEntries(holdingRows.map((h) => [h.name, h.id]));

  // 12.4) 买入转账流水（与 createInvestmentService / insertHoldingCore 一致：扣款账户→关联账户，金额=成本+费用）/ Buy transfer flows
  for (const h of HOLDING_DEFS) {
    if (h.paymentAccountId === h.accountId) continue;
    const buyCents = h.costCents + h.feeCents;
    if (buyCents <= 0) continue;
    const hid = holdingIdByName[h.name];
    if (!hid) continue;
    const [buyTx] = await db.insert(transactions).values({
      ledgerId: ledger.id,
      accountId: acctIdByKey[acctDefs.find((a) => a.key === h.paymentAccountId)!.name],
      toAccountId: acctIdByKey[acctDefs.find((a) => a.key === h.accountId)!.name],
      type: TX.transfer, categoryId: null, projectId: null,
      amountCents: buyCents,
      txDate: h.purchaseDate,
      remark: `买入 ${h.name}`,
      createdBy: admin.id,
      investmentHoldingId: hid,
      ...txCurrencyFields(h.paymentAccountId, h.accountId, TX.transfer, buyCents),
    }).returning({ id: transactions.id });
    // 写回买入流水指针，使编辑持仓可精确改写 / 删除该流水（与 buyTransactionId 特性一致）
    await db.update(investmentHoldings).set({ buyTransactionId: buyTx.id }).where(eq(investmentHoldings.id, hid));
  }

  // 12.5) 持仓标签（持仓级标签：列表「标签」列展示、编辑页可改）/ Holding tags (shown in list "tags" column, editable in the form)
  const holdingTagRows = HOLDING_TAG_DEFS
    .map((x) => ({ holdingId: holdingIdByName[x.holding], tagId: tagMap[x.tag]?.id }))
    .filter((x): x is { holdingId: string; tagId: string } => Boolean(x.holdingId && x.tagId));
  if (holdingTagRows.length > 0) await db.insert(holdingTags).values(holdingTagRows);

  // 13) 周期计划 / Recurring plans
  await db.insert(recurringPlans).values(
    RECURRING_DEFS.map((r) => ({
      ledgerId: ledger.id,
      name: r.name,
      type: r.type,
      amountCents: r.amountCents,
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth ?? null,
      dayOfWeek: r.dayOfWeek ?? null,
      accountId: acctIdByKey[acctDefs.find((a) => a.key === r.accountId)!.name],
      toAccountId: r.toAccountId ? acctIdByKey[acctDefs.find((a) => a.key === r.toAccountId)!.name] ?? null : null,
      categoryId: r.categoryId ? catMap[r.categoryId]?.id ?? null : null,
      nextDate: r.nextDate,
      status: r.status,
      remark: r.remark,
      createdBy: admin.id,
    })),
  );

  // 14) 操作日志 / Audit logs
  await db.insert(auditLogs).values(
    AUDIT_LOG_DEFS.map((a) => ({
      userId: admin.id,
      action: a.action,
      entity: a.entity,
      summary: a.summary,
      requestBody: a.requestBody,
      responseBody: a.responseBody,
      ip: a.ip,
    })),
  );

  console.log(
    `✅ 种子完成：用户 admin@example.com / ${adminPassword}，` +
    `账本「${ledger.name}」，${acctDefs.length} 账户、` +
    `${txRows.length + histTxRows.length} 条流水（含 ${histTxRows.length} 条历史）、` +
    `${HOLDING_DEFS.length} 笔投资持仓（${holdingTagRows.length} 条持仓标签）、` +
    `${RECURRING_DEFS.length} 条周期计划、` +
    `${AUDIT_LOG_DEFS.length} 条操作日志、${MENU_DEFS.length} 条菜单（${MENU_GROUP_DEFS.length} 分组）、` +
    `${ACTIVE_MENU_IDS.length} 条账本菜单配置`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("❌ 种子失败", e); process.exit(1); });
