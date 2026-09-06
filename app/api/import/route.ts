import { requireUser, requireLedgerAccess } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";
import { transactions, accounts, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { getLocale, getDictionary } from "@/lib/i18n";
import * as XLSX from "@e965/xlsx";
import zhDict from "@/messages/zh.json";
import enDict from "@/messages/en.json";

/** 导入 Excel（流水）：行级校验，账户/分类按名称匹配或自动创建，返回行级报告 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 文件大小上限
const MAX_ROWS = 1000; // 单次导入行数上限
const ALLOWED_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIMES = ["text/csv", "application/csv", "text/plain"];

export async function POST(req: Request) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) return Response.json({ ok: false, message: d.errors.noLedger }, { status: 400 });

  // 角色校验：viewer 无权导入写流水，至少 editor / Require editor+ to import transactions
  await requireLedgerAccess(ledger.id, "editor");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, message: d.errors.uploadXlsx }, { status: 400 });
  }

  // 文件大小校验 / File size check
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ ok: false, message: d.errors.fileTooLarge.replace("{max}", String(MAX_FILE_SIZE / 1024 / 1024)) }, { status: 400 });
  }
  // 文件类型校验（MIME + 扩展名）/ File type check (.xlsx / .csv)
  const lowerName = file.name.toLowerCase();
  const isExcel = lowerName.endsWith(".xlsx") || file.type === ALLOWED_MIME;
  const isCsv = lowerName.endsWith(".csv") || CSV_MIMES.includes(file.type);
  if (!isExcel && !isCsv) {
    return Response.json({ ok: false, message: d.errors.onlyXlsx }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const txSheetNames = [zhDict.nav.transactions, enDict.nav.transactions].map((s) => String(s).trim());
  const sheetName = wb.SheetNames.find((n) => txSheetNames.includes(n.trim())) ?? wb.SheetNames.find((n) => n.includes("流水")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }) as Record<string, unknown>[];

  // 行数上限校验 / Row count limit
  if (rows.length > MAX_ROWS) {
    return Response.json({ ok: false, message: d.errors.tooManyRows.replace("{max}", String(MAX_ROWS)).replace("{count}", String(rows.length)) }, { status: 400 });
  }

  // 现有映射（名称 → id）
  const [accts, cats] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
  ]);
  const acctByName = new Map(accts.map((a) => [a.name, a]));
  const catByName = new Map(cats.map((c) => [c.name, c]));

  // 日期规范化：文本原样保留；Excel 序列号/Date 对象统一转 YYYY-MM-DD
  function normalizeDate(v: unknown): string {
    if (typeof v === "number" && v > 20000) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p?.y && p?.m && p?.d) {
        return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      }
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = v.getMonth() + 1;
      const d = v.getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return String(v ?? "").trim();
  }

  let success = 0;
  const errors: string[] = [];

  // 双语表头 / 类型标签匹配：导入兼容中英文导出的文件（与当前界面语言无关）
  const DICTS = [zhDict as Record<string, any>, enDict as Record<string, any>];
  const h = (getter: (d: any) => string) => DICTS.map(getter).map((s) => String(s).trim());
  const typeCandidates = h((d) => d.tx.type);
  const dateCandidates = h((d) => d.tx.date);
  const accountCandidates = h((d) => d.tx.account);
  const amountCandidates = h((d) => d.tx.amount);
  const categoryCandidates = h((d) => d.tx.category);
  const remarkCandidates = h((d) => d.common.remark);

  const typeLabelMap: Record<string, "income" | "expense" | "transfer"> = {};
  for (const d of DICTS) {
    typeLabelMap[String(d.common.income).trim()] = "income";
    typeLabelMap[String(d.common.expense).trim()] = "expense";
    typeLabelMap[String(d.common.transfer).trim()] = "transfer";
  }

  // 按候选表头取单元格值（忽略首尾空白）
  function cell(row: Record<string, unknown>, candidates: string[]): unknown {
    const norm = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) norm.set(k.trim(), v);
    for (const c of candidates) if (norm.has(c)) return norm.get(c);
    return undefined;
  }

  type ParsedRow = {
    lineNo: number;
    type: "income" | "expense" | "transfer";
    date: string;
    acctName: string;
    catName: string;
    cents: number;
    remark: string;
  };

  // 解析阶段：逐行校验，收集可导入行与解析错误（不写库）
  const parsed: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineNo = i + 2; // 表头占 1 行
    const type = typeLabelMap[String(cell(r, typeCandidates) ?? "").trim()];
    const date = normalizeDate(cell(r, dateCandidates));
    const acctName = String(cell(r, accountCandidates) ?? "").trim();
    const amount = cell(r, amountCandidates);

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
    if (cents <= 0) { errors.push(d.errors.rowAmountPositive.replace("{line}", String(lineNo))); continue; }

    const catName = String(cell(r, categoryCandidates) ?? "").trim();
    parsed.push({ lineNo, type, date, acctName, catName, cents, remark: String(cell(r, remarkCandidates) ?? "").trim() });
  }

  // 写入阶段：单事务批量插入（审计与业务同事务，仅一条汇总审计，避免逐行事务开销）
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
        async (tx) => {
          // 自动创建缺失账户（cash/储蓄卡）
          const missingAccts = [...new Set(parsed.map((p) => p.acctName).filter((n) => !acctByName.has(n)))];
          for (const name of missingAccts) {
            const [row] = await tx
              .insert(accounts)
              .values({ ledgerId: ledger.id, name, type: "custom", icon: "💳", currencyCode: "CNY", openingBalanceCents: 0, isAsset: true, createdBy: user.id })
              .returning();
            acctByName.set(name, row);
          }
          // 自动创建缺失分类
          const missingCats = [...new Set(parsed.map((p) => p.catName).filter((n) => n && !catByName.has(n)))];
          for (const name of missingCats) {
            const t = parsed.find((p) => p.catName === name)!.type;
            const [row] = await tx
              .insert(categories)
              .values({ ledgerId: ledger.id, name, type: t === "income" ? "income" : "expense", icon: "📦" })
              .returning();
            catByName.set(name, row);
          }
          // 批量插入流水
          await tx.insert(transactions).values(
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

  return Response.json({
    ok: true,
    total: rows.length,
    success,
    failed: errors.length,
    message: d.errors.importComplete.replace("{success}", String(success)).replace("{failed}", String(errors.length)),
    errors,
  });
}
