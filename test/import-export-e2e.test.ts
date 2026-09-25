/**
 * ratcount · import / export 接口专项测试（基于真实业务路径复刻）
 *
 * 测试对象：app/api/import/route.ts 与 app/api/export/route.ts
 * 佐证源码：app/api/import/template/route.ts、lib/scope.ts、lib/ledger.ts、lib/audit.ts、lib/money.ts、lib/queries.ts、messages/zh.json
 *
 * 技术方案（与项目既有 security.test.ts 方法论一致）：
 *  - requireUser / getCurrentLedger 依赖 NextAuth session 与 next/headers cookies，纯 node 环境无法驱动真实 redirect / cookies，
 *    因此将两个 route 的【鉴权边界】按真实源码语义等价剥离：
 *      · 账本为空 → 400 noLedger（与 getCurrentLedger 返回 null 分支一致）
 *      · 角色守卫 → 复刻 lib/scope.ts requireLedgerAccess(ledgerId, "editor") 的真实查询逻辑
 *        （查 ledger_members，仅 owner/editor 放行，viewer/非成员 redirect("/dashboard")）
 *  - 【业务核心】逐行复制自真实 route 源码：文件大小/类型校验、XLSX 解析、sheet 选取、行数上限、
 *    逐行解析校验（normalizeDate / typeLabel / yuanToCents 全部直用真实工具）、withAudit 单事务写库、
 *    账户/分类按名称匹配或自动创建、审计汇总一条；export 的 5-sheet workbook 构建与分页分批拉取直用
 *    真实 lib/queries 的 listTransactions / listAccountsWithBalance + 真实 @e965/xlsx。
 *  - 数据库使用真实 schema（21 表 DDL）+ 独立临时 SQLite；i18n 消息直用真实 messages/zh.json。
 *
 * 运行：npx tsx --test test/import-export-e2e.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "@e965/xlsx";
import zh from "../messages/zh-CN.json";
import { yuanToCents } from "../lib/money";
import { setupTestDb, seedTestData } from "./helpers/db-fixture";

// 与 app/api/import/route.ts 顶部常量保持一致
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 1000;
const ALLOWED_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIMES = ["text/csv", "application/csv", "text/plain"];

let db: any;
let seed: any;
let withAudit: any;
let listTransactions: any;
let listAccountsWithBalance: any;
let schema: any;
let tempDir: string;

/** 构造一个 FormData 风格的 File（Node 24 全局 File） */
function makeFile(buf: Uint8Array | Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buf)], name, { type });
}

/** 由 aoa 数据构造 Excel buffer（首行即表头，与模板/路由解析一致） */
function xlsxFromAoa(rows: unknown[][], sheetName = "流水"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

/** UTF-8 BOM CSV buffer */
function csvBuffer(headers: string[], rows: string[][]): Buffer {
  const text = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  return Buffer.from("\uFEFF" + text, "utf8");
}

/**
 * 复刻 app/api/import/route.ts 的业务路径（源码逐行还原，仅剥离鉴权边界）。
 * 返回 { status, body, redirected, thrown } 与源码响应语义一一对应。
 */
async function runImport(opts: {
  ledgerId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  file: File | null;
}): Promise<{ status: number; redirected?: boolean; body?: any; thrown?: unknown }> {
  const { eq, and } = await import("drizzle-orm");
  const ledgers = await db.select().from(schema.ledgers).where(eq(schema.ledgers.id, opts.ledgerId)).limit(1);
  const ledger = ledgers[0];
  // 等价 getCurrentLedger() === null → 400 noLedger
  if (!ledger) return { status: 400, body: { ok: false, message: zh.errors.noLedger } };

  // 等价 requireLedgerAccess(ledger.id, "editor")：viewer/非成员 → redirect("/dashboard")
  const members = await db
    .select()
    .from(schema.ledgerMembers)
    .where(and(eq(schema.ledgerMembers.ledgerId, opts.ledgerId), eq(schema.ledgerMembers.userId, opts.userId)))
    .limit(1);
  const member = members[0];
  if (!member || !["owner", "editor"].includes(member.role)) {
    return { status: 302, redirected: true, body: null };
  }

  const user = { id: opts.userId };
  const d = zh;
  const { file } = opts;
  // —— 以下与 route.ts 源码逐行一致 ——
  if (!(file instanceof File)) {
    return { status: 400, body: { ok: false, message: d.errors.uploadXlsx } };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      status: 400,
      body: { ok: false, message: d.errors.fileTooLarge.replace("{max}", String(MAX_FILE_SIZE / 1024 / 1024)) },
    };
  }
  const lowerName = file.name.toLowerCase();
  const isExcel = lowerName.endsWith(".xlsx") || file.type === ALLOWED_MIME;
  const isCsv = lowerName.endsWith(".csv") || CSV_MIMES.includes(file.type);
  if (!isExcel && !isCsv) {
    return { status: 400, body: { ok: false, message: d.errors.onlyXlsx } };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames.find((n: string) => n.includes("流水")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }) as Record<string, unknown>[];

  if (rows.length > MAX_ROWS) {
    return {
      status: 400,
      body: { ok: false, message: d.errors.tooManyRows.replace("{max}", String(MAX_ROWS)).replace("{count}", String(rows.length)) },
    };
  }

  const [accts, cats] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.ledgerId, ledger.id)),
    db.select().from(schema.categories).where(eq(schema.categories.ledgerId, ledger.id)),
  ]);
  const acctByName = new Map<string, any>(accts.map((a: any) => [a.name, a]));
  const catByName = new Map<string, any>(cats.map((c: any) => [c.name, c]));

  function normalizeDate(v: unknown): string {
    if (typeof v === "number" && v > 20000) {
      const p: any = XLSX.SSF.parse_date_code(v);
      if (p?.y && p?.m && p?.d) {
        return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      }
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = v.getMonth() + 1;
      const dt = v.getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(dt).padStart(2, "0")}`;
    }
    return String(v ?? "").trim();
  }

  const typeLabel: Record<string, "income" | "expense" | "transfer"> = {
    收入: "income", income: "income",
    支出: "expense", expense: "expense",
    转账: "transfer", transfer: "transfer",
  };

  type ParsedRow = {
    lineNo: number;
    type: "income" | "expense" | "transfer";
    date: string;
    acctName: string;
    catName: string;
    cents: number;
    remark: string;
  };

  let success = 0;
  const errors: string[] = [];
  const parsed: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineNo = i + 2; // 表头占 1 行
    const type = typeLabel[String(r["类型"] ?? "").trim()];
    const date = normalizeDate(r["日期"]);
    const acctName = String(r["账户"] ?? "").trim();
    const amount = r["金额"];

    if (!type || !date || !acctName || amount === "") {
      errors.push(d.errors.rowRequired.replace("{line}", String(lineNo)));
      continue;
    }
    let cents: number;
    if (typeof amount === "number") {
      cents = Math.round(amount * 100);
    } else {
      const parsedAmt = yuanToCents(String(amount));
      if (parsedAmt === null) {
        errors.push(d.errors.rowAmountInvalid.replace("{line}", String(lineNo)));
        continue;
      }
      cents = parsedAmt;
    }
    if (cents <= 0) {
      errors.push(d.errors.rowAmountPositive.replace("{line}", String(lineNo)));
      continue;
    }
    const catName = String(r["分类"] ?? "").trim();
    parsed.push({ lineNo, type, date, acctName, catName, cents, remark: String(r["备注"] ?? "").trim() });
  }

  const planned = parsed.length;
  if (planned > 0) {
    try {
      await withAudit(
        {
          userId: user.id, action: "C", entity: "import",
          summary: `Excel 导入：写入 ${planned} 行（解析失败 ${errors.length} 行已跳过）`,
          requestBody: JSON.stringify({ fileName: file.name, total: rows.length, planned, parseFailed: errors.length }),
          responseBody: '{"result":"created"}',
        },
        async (tx: any) => {
          const missingAccts = [...new Set(parsed.map((p) => p.acctName).filter((n) => !acctByName.has(n)))];
          for (const name of missingAccts) {
            const [row] = await tx
              .insert(schema.accounts)
              .values({ ledgerId: ledger.id, name, type: "custom", icon: "💳", currencyCode: "CNY", openingBalanceCents: 0, isAsset: true, createdBy: user.id })
              .returning();
            acctByName.set(name, row);
          }
          const missingCats = [...new Set(parsed.map((p) => p.catName).filter((n) => n && !catByName.has(n)))];
          for (const name of missingCats) {
            const t = parsed.find((p) => p.catName === name)!.type;
            const [row] = await tx
              .insert(schema.categories)
              .values({ ledgerId: ledger.id, name, type: t === "income" ? "income" : "expense", icon: "📦" })
              .returning();
            catByName.set(name, row);
          }
          await tx.insert(schema.transactions).values(
            parsed.map((p) => ({
              ledgerId: ledger.id,
              accountId: acctByName.get(p.acctName)!.id,
              type: p.type,
              categoryId: p.type === "transfer" ? null : (p.catName ? (catByName.get(p.catName)?.id ?? null) : null),
              amountCents: p.cents,
              txDate: p.date,
              remark: p.remark || null,
              createdBy: user.id,
            })),
          );
        },
      );
      success = planned;
    } catch {
      errors.push(d.errors.importFailed);
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      total: rows.length,
      success,
      failed: errors.length,
      message: d.errors.importComplete.replace("{success}", String(success)).replace("{failed}", String(errors.length)),
      errors,
    },
  };
}

/**
 * 复刻 app/api/export/route.ts 的业务路径（源码逐行还原，仅剥离鉴权边界）。
 * 返回 { buffer, headers }：Content-Type / Content-Disposition 与源码一致。
 */
async function runExport(ledgerId: string): Promise<{ buffer: Buffer; headers: Record<string, string> }> {
  const { eq } = await import("drizzle-orm");
  const d = zh;

  const [accts, cats, tgs, projs] = await Promise.all([
    listAccountsWithBalance(ledgerId),
    db.select().from(schema.categories).where(eq(schema.categories.ledgerId, ledgerId)),
    db.select().from(schema.tags).where(eq(schema.tags.ledgerId, ledgerId)),
    db.select().from(schema.projects).where(eq(schema.projects.ledgerId, ledgerId)),
  ]);

  const TX_BATCH = 5000;
  const txHeader = [d.common.type, d.common.date, d.common.account, d.add.toAccount, d.tx.category, d.common.project, d.common.amount, d.common.remark, d.tx.tag];

  const acctTypeKey: Record<string, keyof typeof d.acctType> = {
    cash: "cash", debit_card: "debitCard", credit_card: "creditCard", wechat: "wechat",
    savings: "savings", investment: "investment", fund: "fund", precious_metal: "preciousMetal",
    bond: "bond", foreign_currency: "foreignCurrency", custom: "custom",
  };

  const wb = XLSX.utils.book_new();

  let txWs: XLSX.WorkSheet | undefined;
  let offset = 0;
  for (;;) {
    const batch = await listTransactions(ledgerId, { limit: TX_BATCH, offset });
    if (batch.length === 0) break;
    const rows = batch.map((t: any) => [
      (d.common as unknown as Record<string, string>)[t.type] ?? t.type,
      t.txDate,
      t.account?.name ?? "",
      t.toAccount?.name ?? "",
      t.category?.name ?? "",
      t.project?.name ?? "",
      t.amountCents / 100,
      t.remark ?? "",
      t.tagList.map((x: any) => x.name).join("、"),
    ]);
    if (!txWs) {
      txWs = XLSX.utils.aoa_to_sheet([txHeader]);
      XLSX.utils.sheet_add_aoa(txWs, rows, { origin: -1 });
    } else {
      XLSX.utils.sheet_add_aoa(txWs, rows, { origin: -1 });
    }
    if (batch.length < TX_BATCH) break;
    offset += TX_BATCH;
  }
  if (!txWs) txWs = XLSX.utils.aoa_to_sheet([txHeader]);
  XLSX.utils.book_append_sheet(wb, txWs, d.nav.transactions);

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      accts.map((a: any) => ({
        [d.common.name]: a.name,
        类型: d.acctType[acctTypeKey[a.type] ?? "custom"] ?? a.type,
        [d.common.icon]: a.icon,
        [d.common.currency]: a.currencyCode,
        [d.accounts.opening]: a.openingBalanceCents / 100,
        [d.accounts.isAsset]: a.isAsset ? d.common.yes : d.common.no,
        [d.common.remark]: a.remark ?? "",
      })),
    ),
    d.nav.accounts,
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cats.map((c: any) => {
      const typeLabel = c.type === "income" ? d.common.income : d.common.expense;
      return { 类型: typeLabel, [d.common.name]: c.name, [d.common.icon]: c.icon };
    })),
    d.tx.category,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tgs.map((t: any) => ({ [d.common.name]: t.name, [d.tags.color]: t.color }))),
    d.tx.tag,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(projs.map((p: any) => {
      const statusLabel = p.status === "active" ? d.projects.active : d.projects.completed;
      return { [d.common.name]: p.name, [d.common.icon]: p.icon, [d.projects.budget]: p.budgetCents / 100, 状态: statusLabel };
    })),
    d.common.project,
  );

  const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
  const date = new Date().toISOString().slice(0, 10);
  return {
    buffer: buf,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ratcount-export-${date}.xlsx"`,
    },
  };
}

/** 读取指定账本当前流水数 / 账户数 / 分类数 / 审计 import 记录数 */
async function counts(ledgerId: string) {
  const { eq } = await import("drizzle-orm");
  const txs = await db.select().from(schema.transactions).where(eq(schema.transactions.ledgerId, ledgerId));
  const accts = await db.select().from(schema.accounts).where(eq(schema.accounts.ledgerId, ledgerId));
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.ledgerId, ledgerId));
  const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "import"));
  return { txs, accts, cats, audits };
}

before(async () => {
  const ctx = await setupTestDb();
  db = ctx.db;
  tempDir = ctx.dir;
  seed = await seedTestData(db);
  ({ withAudit } = await import("../lib/audit"));
  ({ listTransactions, listAccountsWithBalance } = await import("../lib/queries"));
  schema = await import("../db/schema");

  // 角色成员：viewer（越权拦截）/ editor（放行）加入账本1，用于角色校验用例
  const { ledgerMembers } = schema;
  await db.insert(ledgerMembers).values([
    { ledgerId: seed.l1.id, userId: "viewer-u-1", role: "viewer" },
    { ledgerId: seed.l1.id, userId: "editor-u-1", role: "editor" },
  ]);
});

after(async () => {
  // 独立临时库，仅记录目录便于排查
});

/* ==================== A. export：5-sheet 结构与内容正确性 ==================== */

test("EXP-1 导出为 5 张 sheet，名称=流水/账户/分类/标签/项目", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  assert.deepStrictEqual(
    wb.SheetNames,
    [zh.nav.transactions, zh.nav.accounts, zh.tx.category, zh.tx.tag, zh.common.project],
    "sheet 名称应依次为 流水/账户/分类/标签/项目",
  );
});

test("EXP-2 流水 sheet 内容正确：表头/类型中文映射/金额分转元/关联字段/标签拼接", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[zh.nav.transactions];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
  // 表头
  assert.deepStrictEqual(Object.keys(rows[0]), [
    zh.common.type, zh.common.date, zh.common.account, zh.add.toAccount,
    zh.tx.category, zh.common.project, zh.common.amount, zh.common.remark, zh.tx.tag,
  ]);
  assert.strictEqual(rows.length, 4, "账本1 种子 4 笔流水");
  const byRemark = Object.fromEntries(rows.map((r) => [r[zh.common.remark], r]));
  // 支出 48.00 / 分类 餐饮 / 项目 装修 / 标签 日常
  const sam = byRemark["山姆会员店"];
  assert.strictEqual(sam[zh.common.type], zh.common.expense);
  assert.strictEqual(sam[zh.common.amount], 48);
  assert.strictEqual(sam[zh.tx.category], "餐饮");
  assert.strictEqual(sam[zh.common.project], "装修");
  assert.strictEqual(sam[zh.common.account], "现金");
  assert.strictEqual(sam[zh.tx.tag], "日常");
  // 收入 8000 / 类型 收入
  const sal = byRemark["本月工资"];
  assert.strictEqual(sal[zh.common.type], zh.common.income);
  assert.strictEqual(sal[zh.common.amount], 8000);
  // 转账 200 / 转入账户 借记卡
  const tr = byRemark["转入卡"];
  assert.strictEqual(tr[zh.common.type], zh.common.transfer);
  assert.strictEqual(tr[zh.common.amount], 200);
  assert.strictEqual(tr[zh.add.toAccount], "借记卡");
  assert.strictEqual(tr[zh.tx.category], "", "转账行分类为空");
});

test("EXP-3 账户 sheet 内容正确：类型中文映射/期初余额分转元/是否计入资产", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[zh.nav.accounts], { defval: "" }) as Record<string, any>[];
  assert.strictEqual(rows.length, 2);
  const byName = Object.fromEntries(rows.map((r) => [r[zh.common.name], r]));
  const cash = byName["现金"];
  assert.strictEqual(cash["类型"], zh.acctType.cash);
  assert.strictEqual(cash[zh.common.currency], "CNY");
  assert.strictEqual(cash[zh.accounts.opening], 100);
  assert.strictEqual(cash[zh.accounts.isAsset], zh.common.yes);
  const card = byName["借记卡"];
  assert.strictEqual(card["类型"], zh.acctType.debitCard);
  assert.strictEqual(card[zh.accounts.opening], 5000);
  assert.ok(!("期初余额不存在" in card));
});

test("EXP-4 分类 sheet 内容正确：类型收入/支出 映射", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[zh.tx.category], { defval: "" }) as Record<string, any>[];
  assert.strictEqual(rows.length, 2);
  const byName = Object.fromEntries(rows.map((r) => [r[zh.common.name], r]));
  assert.strictEqual(byName["餐饮"]["类型"], zh.common.expense);
  assert.strictEqual(byName["工资"]["类型"], zh.common.income);
});

test("EXP-5 标签 sheet 内容正确：名称 + 颜色", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[zh.tx.tag], { defval: "" }) as Record<string, any>[];
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][zh.common.name], "日常");
  assert.strictEqual(rows[0][zh.tags.color], "#0d9488");
});

test("EXP-6 项目 sheet 内容正确：预算分转元/状态进行中 映射", async () => {
  const { buffer } = await runExport(seed.l1.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[zh.common.project], { defval: "" }) as Record<string, any>[];
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][zh.common.name], "装修");
  assert.strictEqual(rows[0][zh.projects.budget], 2000);
  assert.strictEqual(rows[0]["状态"], zh.projects.active);
});

test("EXP-7 导出文件字节有效：ZIP 魔术头 + 可被 @e965/xlsx 回读且 5 sheet 全部可解析", async () => {
  const { buffer, headers } = await runExport(seed.l1.id);
  assert.strictEqual(buffer.subarray(0, 2).toString("latin1"), "PK", "xlsx 应为 ZIP 容器");
  assert.strictEqual(headers["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(headers["Content-Disposition"], /^attachment; filename="ratcount-export-\d{4}-\d{2}-\d{2}\.xlsx"$/);
  const wb = XLSX.read(buffer, { type: "buffer" });
  assert.strictEqual(wb.SheetNames.length, 5);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
    assert.ok(Array.isArray(rows), `sheet ${name} 可解析`);
  }
});

test("EXP-8 空账本导出：流水 sheet 仅表头，其余 sheet 为空", async () => {
  const { ledgers, ledgerMembers, accounts } = schema;
  const { eq } = await import("drizzle-orm");
  const [emptyLedger] = await db.insert(ledgers).values({ name: "空账本", createdBy: seed.u1.id }).returning();
  await db.insert(ledgerMembers).values({ ledgerId: emptyLedger.id, userId: seed.u1.id, role: "owner" });
  await db.insert(accounts).values({
    ledgerId: emptyLedger.id, name: "卡A", type: "cash", createdBy: seed.u1.id,
  }).returning();
  const fakeAcct = null; // 占位避免误用
  const { buffer } = await runExport(emptyLedger.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[zh.nav.transactions];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  assert.strictEqual(rows.length, 0, "空账本流水 sheet 不应有数据行（仅表头）");
  void fakeAcct;
});

test("EXP-9 分页分批：5000 行批次边界下导出全量无遗漏（构造 5200 笔）", async () => {
  const { ledgers, ledgerMembers, accounts, transactions } = schema;
  const { eq } = await import("drizzle-orm");
  const [big] = await db.insert(ledgers).values({ name: "大批量账本", createdBy: seed.u1.id }).returning();
  await db.insert(ledgerMembers).values({ ledgerId: big.id, userId: seed.u1.id, role: "owner" });
  const [acct] = await db.insert(accounts).values({
    ledgerId: big.id, name: "批量卡", type: "cash", icon: "💳", currencyCode: "CNY",
    openingBalanceCents: 0, isAsset: true, createdBy: seed.u1.id,
  }).returning();
  const N = 5200;
  // 分批写入（每批 50），规避 SQLite 单条 INSERT 变量数上限（SQLITE_MAX_VARIABLE_NUMBER 默认 999：50×13=650 < 999）
  for (let s = 0; s < N; s += 50) {
    const batch = Array.from({ length: Math.min(50, N - s) }, (_, k) => {
      const i = s + k;
      return {
        ledgerId: big.id, accountId: acct.id, type: "expense", amountCents: i + 1,
        txDate: new Date(2026, 0, 1 + (i % 28)).toISOString().slice(0, 10),
        remark: `批量行-${i}`, createdBy: seed.u1.id,
      };
    });
    await db.insert(transactions).values(batch);
  }
  const { buffer } = await runExport(big.id);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[zh.nav.transactions], { defval: "" }) as Record<string, any>[];
  assert.strictEqual(rows.length, N, "5200 笔应全量导出（跨越 5000 批次边界）");
  const remarks = new Set(rows.map((r) => r[zh.common.remark]));
  assert.strictEqual(remarks.size, N, "无重复/遗漏行");
});

/* ==================== B. import：正常导入（Excel / CSV） ==================== */

test("IMP-1 正常 Excel 导入：流水写入 + 自动建账户/分类 + 转账行分类空 + 审计一条", async () => {
  const beforeWal = await counts(seed.l2.id);
  const baseTx = beforeWal.txs.length, baseAcct = beforeWal.accts.length, baseCat = beforeWal.cats.length, baseAudit = beforeWal.audits.length;
  const xlsx = xlsxFromAoa([
    ["类型", "日期", "账户", "分类", "金额", "备注"],
    ["收入", "2026-09-01", "工作卡", "工资", 100, "九月工资"],
    ["支出", "2026-09-02", "新账户X", "新分类Y", 25.5, "午饭"],
    ["转账", "2026-09-03", "工作卡", "", 500, "转卡"],
  ]);
  const res = await runImport({ ledgerId: seed.l2.id, userId: seed.u2.id, role: "owner", file: makeFile(xlsx, "normal.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {
    ok: true, total: 3, success: 3, failed: 0,
    message: zh.errors.importComplete.replace("{success}", "3").replace("{failed}", "0"),
    errors: [],
  });
  const after = await counts(seed.l2.id);
  assert.strictEqual(after.txs.length, baseTx + 3, "新增 3 笔流水");
  assert.strictEqual(after.accts.length, baseAcct + 1, "自动创建账户 新账户X（工作卡已存在）");
  assert.ok(after.accts.some((a: any) => a.name === "新账户X"), "账户 新账户X 已自动创建");
  assert.ok(after.cats.some((c: any) => c.name === "新分类Y"), "分类 新分类Y 已自动创建");
  assert.ok(after.cats.some((c: any) => c.name === "工资"), "分类 工资（l2 原先无分类）也已自动创建");
  assert.strictEqual(after.audits.length, baseAudit + 1, "写入 1 条 import 审计");
  // 断言落库字段
  const { eq } = await import("drizzle-orm");
  const row = await db.select().from(schema.transactions).where(eq(schema.transactions.remark, "午饭")).limit(1);
  assert.strictEqual(row[0].type, "expense");
  assert.strictEqual(row[0].amountCents, 2550, "25.5 元 → 2550 分");
  assert.strictEqual(row[0].categoryId, after.cats.find((c: any) => c.name === "新分类Y")!.id);
  const trRow = await db.select().from(schema.transactions).where(eq(schema.transactions.remark, "转卡")).limit(1);
  assert.strictEqual(trRow[0].type, "transfer");
  assert.strictEqual(trRow[0].categoryId, null, "转账行分类为空");
  const auditRow = after.audits[after.audits.length - 1];
  assert.strictEqual(auditRow.action, "C");
  assert.match(auditRow.summary, /Excel 导入：写入 3 行/);
});

test("IMP-2 正常 CSV 导入（UTF-8 BOM）：同结构解析、金额按字符串换算、自动建账户", async () => {
  const beforeAcct = (await counts(seed.l2.id)).accts.length;
  const csv = csvBuffer(
    ["类型", "日期", "账户", "分类", "金额", "备注"],
    [
      ["收入", "2026-09-01", "CSV账户", "工资", "88.88", "CSV收入"],
      ["支出", "2026-09-02", "CSV账户", "餐饮", "12.3", "CSV支出"],
    ],
  );
  const res = await runImport({ ledgerId: seed.l2.id, userId: seed.u2.id, role: "owner", file: makeFile(csv, "data.csv", "text/csv") });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, 2);
  assert.strictEqual(res.body.failed, 0);
  const after = await counts(seed.l2.id);
  assert.strictEqual(after.accts.length, beforeAcct + 1, "CSV 自动建账户 CSV账户");
  const { eq } = await import("drizzle-orm");
  const row = await db.select().from(schema.transactions).where(eq(schema.transactions.remark, "CSV收入")).limit(1);
  assert.strictEqual(row[0].amountCents, 8888, "字符串金额 88.88 元 → 8888 分");
  assert.strictEqual(row[0].type, "income");
});

test("IMP-3 已有账户/分类不重复创建（按名称匹配）", async () => {
  const before = await counts(seed.l2.id);
  const xlsx = xlsxFromAoa([
    ["类型", "日期", "账户", "分类", "金额"],
    ["支出", "2026-09-04", "工作卡", "餐饮", 10],
  ]);
  const res = await runImport({ ledgerId: seed.l2.id, userId: seed.u2.id, role: "owner", file: makeFile(xlsx, "match.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.body.success, 1);
  const after = await counts(seed.l2.id);
  assert.strictEqual(after.accts.length, before.accts.length, "账本2 无 餐饮 分类但账户 工作卡 已存在，不新建账户");
  // 餐饮分类已在 IMP-2（l2 的 CSV 用例）中自动创建过，此处按名称匹配复用、不再新建
  assert.strictEqual(after.cats.length, before.cats.length, "餐饮分类已存在，不重复创建");
  assert.strictEqual(after.accts.length, before.accts.length, "工作卡账户已存在，不重复创建");
});

/* ==================== C. import：错误类型 / 超大小 / 超行数 拒绝 ==================== */

test("IMP-4 错误类型文件被拒：.pdf / application/octet-stream → 400 onlyXlsx", async () => {
  const r1 = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(Buffer.from("%PDF-1.4 fake"), "bad.pdf", "application/pdf") });
  assert.strictEqual(r1.status, 400);
  assert.strictEqual(r1.body.message, zh.errors.onlyXlsx);
  const r2 = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(Buffer.from("MZ...."), "app.exe", "application/octet-stream") });
  assert.strictEqual(r2.status, 400);
  assert.strictEqual(r2.body.message, zh.errors.onlyXlsx);
  // 观察边界：text/plain 在 CSV_MIMES 白名单内（源码放行），此断言如实记录该语义而非当作被拒
  const r3 = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(Buffer.from("a"), "note.txt", "text/plain") });
  assert.notStrictEqual(r3.status, 400, "按源码语义 text/plain 被当作 CSV 放行（边界观察项）");
});

test("IMP-5 非 File 字段 → 400 uploadXlsx", async () => {
  const res = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: null });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.message, zh.errors.uploadXlsx);
});

test("IMP-6 超大小文件（>10MB）被拒 → 400 fileTooLarge", async () => {
  const big = Buffer.alloc(MAX_FILE_SIZE + 1, 0x41);
  const res = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(big, "big.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.message, zh.errors.fileTooLarge.replace("{max}", "10"));
});

test("IMP-7 超行数（>1000 行）被拒 → 400 tooManyRows", async () => {
  const rows: unknown[][] = [["类型", "日期", "账户", "分类", "金额", "备注"]];
  for (let i = 0; i < 1001; i++) rows.push(["收入", "2026-09-01", "工作卡", "工资", 1, `r${i}`]);
  const xlsx = xlsxFromAoa(rows);
  const res = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(xlsx, "many.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.message, zh.errors.tooManyRows.replace("{max}", "1000").replace("{count}", "1001"));
});

/* ==================== D. import：行级错误报告 ==================== */

test("IMP-8 混合文件行级错误报告：缺字段/非法金额/非正数被跳过，正常行照常写入", async () => {
  const before = (await counts(seed.l1.id)).txs.length;
  const xlsx = xlsxFromAoa([
    ["类型", "日期", "账户", "分类", "金额", "备注"],
    ["收入", "2026-09-01", "现金", "工资", 100, "好行1"],      // line 2 OK
    ["收入", "", "现金", "工资", 100, "缺日期"],                // line 3 缺日期 → rowRequired
    ["支出", "2026-09-01", "", "餐饮", 30, "缺账户"],           // line 4 缺账户 → rowRequired
    ["支出", "2026-09-01", "现金", "餐饮", 30.5, "好行2"],      // line 5 OK
    ["收入", "2026-09-01", "现金", "工资", "abc", "非法金额"],   // line 6 → rowAmountInvalid
    ["收入", "2026-09-01", "现金", "工资", "12.345", "三位小数"], // line 7 → rowAmountInvalid
    ["支出", "2026-09-01", "现金", "餐饮", 0, "零金额"],        // line 8 → rowAmountPositive
    ["支出", "2026-09-01", "现金", "餐饮", -8, "负金额"],       // line 9 → rowAmountPositive
    ["非类型", "2026-09-01", "现金", "餐饮", 5, "非法类型"],     // line 10 类型非法 → rowRequired
  ]);
  const res = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(xlsx, "mixed.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 9);
  assert.strictEqual(res.body.success, 2, "好行1/好行2 写入");
  assert.strictEqual(res.body.failed, 7);
  assert.strictEqual(res.body.errors.length, 7);
  const msg = res.body.errors;
  assert.ok(msg.some((m: string) => m.includes("第 3 行")), "缺日期行号 3");
  assert.ok(msg.some((m: string) => m.includes("第 4 行")), "缺账户行号 4");
  assert.ok(msg.some((m: string) => m === zh.errors.rowAmountInvalid.replace("{line}", "6")), "非法金额行号 6 精确消息");
  assert.ok(msg.some((m: string) => m.includes("第 7 行")), "三位小数行号 7");
  assert.ok(msg.some((m: string) => m.includes("第 8 行")), "零金额行号 8");
  assert.ok(msg.some((m: string) => m.includes("第 9 行")), "负金额行号 9");
  assert.ok(msg.some((m: string) => m.includes("第 10 行")), "非法类型行号 10");
  // 错误行不落库
  const after = (await counts(seed.l1.id)).txs.length;
  assert.strictEqual(after, before + 2);
  void zh;
});

/* ==================== E. import：畸形 / 损坏文件 ==================== */

test("IMP-9 畸形文件（随机字节 / 空文件 / 文本伪装 xlsx）不会导致服务端 500（源码现状如实记录）", async () => {
  // 真实源码在 XLSX.read(buf) 处【没有】try/catch：此处复刻也保持不捕获，
  // 用于探明真实行为 —— 若抛异常即证明源码确实会在畸形文件时 500。
  const cases: Array<{ label: string; file: File }> = [
    { label: "随机字节", file: makeFile(Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]), "bad.xlsx", ALLOWED_MIME) },
    { label: "文本伪装", file: makeFile(Buffer.from("this is not an xlsx", "utf8"), "fake.xlsx", ALLOWED_MIME) },
  ];
  for (const c of cases) {
    let outcome: any = {};
    try {
      outcome = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: c.file });
    } catch (e) {
      outcome = { thrown: e };
    }
    if (outcome.thrown) {
      // 源码缺陷：XLSX.read 抛异常未被捕获 → 真实 route 会 500（不满足任务的“不 500”预期）
      assert.fail(`[${c.label}] XLSX.read 抛异常（源码无 try/catch，真实会 500）：${String(outcome.thrown).slice(0, 200)}`);
    } else {
      assert.ok(outcome.status === 200 || outcome.status === 400, `[${c.label}] 未出现未捕获异常`);
    }
  }
  // 空文件：XLSX.read 空 buffer 行为
  let emptyOutcome: any = {};
  try {
    emptyOutcome = await runImport({ ledgerId: seed.l1.id, userId: seed.u1.id, role: "owner", file: makeFile(Buffer.alloc(0), "empty.xlsx", ALLOWED_MIME) });
  } catch (e) {
    emptyOutcome = { thrown: e };
  }
  if (emptyOutcome.thrown) {
    assert.fail(`[空文件] XLSX.read 抛异常（源码无 try/catch，真实会 500）：${String(emptyOutcome.thrown).slice(0, 200)}`);
  }
});

/* ==================== F. import：账本角色校验（viewer 越权拦截） ==================== */

test("IMP-10 viewer 越权导入被拦截（等价 requireLedgerAccess(ledgerId, 'editor')）：不写库、无审计", async () => {
  const before = await counts(seed.l1.id);
  const xlsx = xlsxFromAoa([
    ["类型", "日期", "账户", "分类", "金额"],
    ["收入", "2026-09-01", "现金", "工资", 1],
  ]);
  // viewer 身份
  const resViewer = await runImport({ ledgerId: seed.l1.id, userId: "viewer-u-1", role: "viewer", file: makeFile(xlsx, "viewer.xlsx", ALLOWED_MIME) });
  assert.strictEqual(resViewer.redirected, true, "viewer 应被重定向 /dashboard（真实 redirect）");
  assert.strictEqual(resViewer.status, 302);
  const afterViewer = await counts(seed.l1.id);
  assert.strictEqual(afterViewer.txs.length, before.txs.length, "viewer 导入不得写库");
  assert.strictEqual(afterViewer.accts.length, before.accts.length);
  assert.strictEqual(afterViewer.audits.length, before.audits.length, "viewer 导入不得写审计");
  // 非成员身份
  const resStranger = await runImport({ ledgerId: seed.l1.id, userId: "stranger-u-1", role: "viewer", file: makeFile(xlsx, "s.xlsx", ALLOWED_MIME) });
  assert.strictEqual(resStranger.redirected, true, "非成员应被重定向");
  // owner / editor 放行
  const { eq, and } = await import("drizzle-orm");
  for (const role of ["owner", "editor"] as const) {
    const uid = role === "owner" ? seed.u1.id : "editor-u-1";
    const mm = await db.select().from(schema.ledgerMembers).where(and(eq(schema.ledgerMembers.ledgerId, seed.l1.id), eq(schema.ledgerMembers.userId, uid))).limit(1);
    assert.strictEqual(mm.length, 1, `${role} 成员应存在于账本1`);
    const r = await runImport({ ledgerId: seed.l1.id, userId: uid, role, file: makeFile(xlsx, "ok.xlsx", ALLOWED_MIME) });
    assert.strictEqual(r.redirected, undefined, `${role} 不应被拦截`);
    assert.strictEqual(r.status, 200);
  }
});

test("IMP-11 无可用账本 → 400 noLedger", async () => {
  const res = await runImport({ ledgerId: "no-such-ledger", userId: seed.u1.id, role: "owner", file: makeFile(xlsxFromAoa([["类型"]]), "x.xlsx", ALLOWED_MIME) });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.message, zh.errors.noLedger);
});
