import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";
import { transactions, accounts, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAudit, writeAudit } from "@/lib/audit";
import { yuanToCents } from "@/lib/money";
import { getLocale, getDictionary } from "@/lib/i18n";
import * as XLSX from "xlsx";

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
  const sheetName = wb.SheetNames.find((n) => n.includes("流水")) ?? wb.SheetNames[0];
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
  const typeOf: Record<string, "income" | "expense"> = { 收入: "income", income: "income" };

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
  const typeLabel: Record<string, "income" | "expense" | "transfer"> = {
    收入: "income", income: "income",
    支出: "expense", expense: "expense",
    转账: "transfer", transfer: "transfer",
  };

  // 按行插入（事务外逐行，便于收集行级错误）
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
      const parsed = yuanToCents(String(amount));
      if (parsed === null) {
        errors.push(d.errors.rowAmountInvalid.replace("{line}", String(lineNo)));
        continue;
      }
      cents = parsed;
    }
    if (cents <= 0) { errors.push(d.errors.rowAmountPositive.replace("{line}", String(lineNo))); continue; }

    // 账户匹配或自动创建（现金/储蓄卡）
    let acctId = acctByName.get(acctName)?.id;
    if (!acctId) {
      const [row] = await db.insert(accounts).values({
        ledgerId: ledger.id, name: acctName, type: "custom", icon: "💳",
        currencyCode: "CNY", openingBalanceCents: 0, isAsset: true, createdBy: user.id,
      }).returning();
      acctId = row.id;
      acctByName.set(acctName, row);
    }

    // 分类匹配或自动创建
    const catName = String(r["分类"] ?? "").trim();
    let catId: string | null = null;
    if (catName) {
      catId = catByName.get(catName)?.id ?? null;
      if (!catId) {
        const [row] = await db.insert(categories).values({
          ledgerId: ledger.id, name: catName,
          type: type === "income" ? "income" : "expense", icon: "📦",
        }).returning();
        catId = row.id;
        catByName.set(catName, row);
      }
    }

    const remark = String(r["备注"] ?? "").trim();
    try {
      await withAudit(
        { userId: user.id, action: "C", entity: "transaction", summary: `Excel 导入 ${remark || "流水"}`, requestBody: JSON.stringify({ line: lineNo, type, accountId: acctId, categoryId: type === "transfer" ? null : catId, amountCents: cents, txDate: date, remark: remark || null }), responseBody: '{"result":"created"}' },
        async (tx) => {
          await tx.insert(transactions).values({
            ledgerId: ledger.id, accountId: acctId, type,
            categoryId: type === "transfer" ? null : catId,
            amountCents: cents, txDate: date, remark: remark || null, createdBy: user.id,
          });
        },
      );
      success++;
    } catch {
      errors.push(d.errors.rowWriteFailed.replace("{line}", String(lineNo)));
    }
  }

  await writeAudit({
    userId: user.id, action: "C", entity: "import",
    summary: `Excel 导入：成功 ${success} 行，失败 ${errors.length} 行`,
    requestBody: JSON.stringify({ fileName: file.name, total: rows.length, success, failed: errors.length }),
    responseBody: JSON.stringify({ ok: true, success, failed: errors.length }),
  }).catch(() => {});

  return Response.json({
    ok: true,
    total: rows.length,
    success,
    failed: errors.length,
    message: d.errors.importComplete.replace("{success}", String(success)).replace("{failed}", String(errors.length)),
    errors,
  });
}
