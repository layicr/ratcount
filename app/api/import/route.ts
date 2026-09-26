import { accounts, categories, transactions, transactionTags } from "@/db/schema"
import { type TransactionType, MR, AUDIT_ACTION, ENTITY, TX, DEFAULT_CURRENCY } from "@/lib/constants"
import { requireUser, requireLedgerAccess } from "@/lib/scope"
import { isTransfer } from "@/lib/constants"


import { getCurrentLedger } from "@/lib/ledger";
import { db } from "@/lib/db";




import { eq, inArray } from "drizzle-orm";
import { withAudit } from "@/lib/audit";
import { ensureAccount, ensureCategory, ensureProject, ensureTag } from "@/lib/ledger-refs";
import { yuanToCents } from "@/lib/money";
import { loadCurrencyRates, rateOf, toBaseCents, convertTo } from "@/lib/currency";
import * as XLSX from "@e965/xlsx";
import { readLocale, getMergedDict } from "@/i18n/dict";
import { randomUUID } from "node:crypto";

/** 导入 Excel（流水）：行级校验，账户/分类按名称匹配或自动创建，返回行级报告 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 文件大小上限
const MAX_ROWS = 1000; // 单次导入行数上限
const ALLOWED_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIMES = ["text/csv", "application/csv", "text/plain"];

export async function POST(req: Request) {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getMergedDict(await readLocale());
  if (!ledger) return Response.json({ ok: false, message: d.errors.noLedger }, { status: 400 });

  // 角色校验：viewer 无权导入写流水，至少 editor / Require editor+ to import transactions
  await requireLedgerAccess(ledger.id, MR.editor);

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
  // UTF-8 CSV 兼容：XLSX 对无 BOM 的 UTF-8 CSV 会按 latin1 解析导致中文乱码、表头匹配失败，
  // 先转 UTF-8 字符串（并去除 BOM）再解析，保证中文表头/内容正确识别。
  let wb: XLSX.WorkBook;
  if (isCsv && !isExcel) {
    let text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    wb = XLSX.read(text, { type: "string" });
  } else {
    wb = XLSX.read(buf, { type: "buffer" });
  }
  const txSheetNames = [String(d.nav.transactions).trim()];
  const sheetName = wb.SheetNames.find((n) => txSheetNames.includes(n.trim())) ?? wb.SheetNames.find((n) => n.includes("流水")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }) as Record<string, unknown>[];

  // 行数上限校验 / Row count limit
  if (rows.length > MAX_ROWS) {
    return Response.json({ ok: false, message: d.errors.tooManyRows.replace("{max}", String(MAX_ROWS)).replace("{count}", String(rows.length)) }, { status: 400 });
  }

  // 现有映射（名称 → id），同时作为公共 ensure 工具的缓存（避免重复查库）
  const [accts, cats] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ledgerId, ledger.id)),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
  ]);
  const acctIdByName = new Map(accts.map((a) => [a.name, a.id]));
  const catIdByName = new Map(cats.map((c) => [`${c.type}::${c.name}`, c.id]));

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

  // 表头 / 类型标签匹配（与当前界面语言一致）
  // 先查 tx 命名空间，未命中再回退 common（如 remark 只在 common）
  const h = (key: keyof typeof d.tx | keyof typeof d.common) =>
    String((d.tx as Record<string, unknown>)[key] ?? (d.common as Record<string, unknown>)[key] ?? "").trim();
  const typeCandidates = [h("type")];
  const dateCandidates = [h("date")];
  const accountCandidates = [h("account")];
  const amountCandidates = [h("amount")];
  const categoryCandidates = [h("category")];
  const remarkCandidates = [h("remark")];
  // 模板额外列：转账目标账户 / 项目 / 标签（均可空，导入后落库）
  const toAccountCandidates = [String(d.add.toAccount ?? "").trim()];
  const projectCandidates = [String(d.common.project ?? "").trim()];
  const tagCandidates = [String(d.tx.tag ?? "").trim()];

  const typeLabelMap: Record<string, TransactionType> = {
    [h("income")]: TX.income,
    [h("expense")]: TX.expense,
    [h("transfer")]: TX.transfer,
  };

  // 按候选表头取单元格值（忽略首尾空白）
  function cell(row: Record<string, unknown>, candidates: string[]): unknown {
    const norm = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) norm.set(k.trim(), v);
    for (const c of candidates) if (norm.has(c)) return norm.get(c);
    return undefined;
  }

  type ParsedRow = {
    lineNo: number;
    type: TransactionType;
    date: string;
    acctName: string;
    catName: string;
    cents: number;
    remark: string;
    toAccountName: string;
    projectName: string;
    tagNames: string[];
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
    // 数字列与文本列统一走 yuanToCents（含上限校验）：避免浮点 *100 与文本路径出现 1 分差
    const parsedAmt = yuanToCents(String(amount));
    if (parsedAmt === null) {
      errors.push(d.errors.rowAmountInvalid.replace("{line}", String(lineNo)));
      continue;
    }
    const cents: number = parsedAmt;
    if (cents <= 0) { errors.push(d.errors.rowAmountPositive.replace("{line}", String(lineNo))); continue; }

    const catName = String(cell(r, categoryCandidates) ?? "").trim();
    const toAccountName = String(cell(r, toAccountCandidates) ?? "").trim();
    const projectName = String(cell(r, projectCandidates) ?? "").trim();
    const tagRaw = String(cell(r, tagCandidates) ?? "").trim();
    const tagNames = tagRaw ? tagRaw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [];
    parsed.push({ lineNo, type, date, acctName, catName, cents, remark: String(cell(r, remarkCandidates) ?? "").trim(), toAccountName, projectName, tagNames });
  }

  // 写入阶段：单事务批量插入（审计与业务同事务，仅一条汇总审计，避免逐行事务开销）
  const planned = parsed.length;
  if (planned > 0) {
    try {
      await withAudit(
        {
          userId: user.id, action: AUDIT_ACTION.create, entity: ENTITY.import,
          summaryKey: "audit.importExcel", summaryParams: { planned, errors: errors.length },
          requestBody: JSON.stringify({ fileName: file.name, total: rows.length, planned, parseFailed: errors.length }),
          responseBody: '{"result":"created"}',
        },
        async (tx) => {
          // 缺失账户统一自动创建（来源账户 + 转账目标账户共用一份缓存：同名即同一账户，避免重复建户）
          const missingAccts = [...new Set(
            parsed.flatMap((p) => [p.acctName, ...(p.type === TX.transfer && p.toAccountName ? [p.toAccountName] : [])]),
          )].filter((n) => !acctIdByName.has(n));
          for (const name of missingAccts) {
            await ensureAccount(tx, ledger.id, name, { createdBy: user.id, cache: acctIdByName });
          }
          // 自动创建缺失分类（按 名称×收支类型 双重维度，空缺即建）——统一走公共 ensureCategory
          // 结构化去重：直接用 (规范类型, 名称) 调用，避免用 `::` 拼接再 split（分类名本身可能含 `::`）；
          // 缓存 key 统一为 `${type}::${name}`，与 catIdByName / ensureCategory 回填口径一致
          const seenCat = new Set<string>();
          for (const p of parsed) {
            if (p.type === TX.transfer || !p.catName) continue;
            const normType = p.type === TX.income ? TX.income : TX.expense;
            const key = `${normType}::${p.catName}`;
            if (seenCat.has(key)) continue;
            seenCat.add(key);
            await ensureCategory(tx, ledger.id, p.catName, normType, catIdByName);
          }
          // 项目：缺失自动创建（按账本 + 名称）
          const projIdByName = new Map<string, string>();
          for (const p of parsed) {
            if (p.projectName && !projIdByName.has(p.projectName)) {
              await ensureProject(tx, ledger.id, p.projectName, { createdBy: user.id, cache: projIdByName });
            }
          }
          // 标签：多值（逗号 / 顿号分隔）缺失自动创建（按账本 + 名称）
          const tagIdByName = new Map<string, string>();
          for (const p of parsed) {
            for (const name of p.tagNames) {
              if (!tagIdByName.has(name)) await ensureTag(tx, ledger.id, name, { createdBy: user.id, cache: tagIdByName });
            }
          }
          // 批量插入流水：按来源账户原币存，并快照 baseAmountCents / toAmountCents（跨币种转账目标额按汇率折算）；项目 / 标签一并写入
          const rates = await loadCurrencyRates();
          const allAcctIds = [...acctIdByName.values()];
          const acctRows = await tx.select({ id: accounts.id, currencyCode: accounts.currencyCode })
            .from(accounts).where(inArray(accounts.id, allAcctIds));
          const curByAcct = new Map(acctRows.map((a) => [a.id, a.currencyCode]));
          const txValues = parsed.map((p) => {
            const accId = acctIdByName.get(p.acctName)!;
            const fromCur = curByAcct.get(accId) ?? DEFAULT_CURRENCY;
            const toAccountId = p.type === TX.transfer && p.toAccountName ? (acctIdByName.get(p.toAccountName) ?? null) : null;
            const toCur = toAccountId ? (curByAcct.get(toAccountId) ?? DEFAULT_CURRENCY) : fromCur;
            const fromRate = rateOf(rates, fromCur);
            const toRate = rateOf(rates, toCur);
            const baseAmountCents = toBaseCents(p.cents, fromRate);
            const toAmountCents = toAccountId ? convertTo(p.cents, fromRate, toRate) : null;
            const categoryId = isTransfer(p.type) ? null : (p.catName ? (catIdByName.get(`${p.type}::${p.catName}`) ?? null) : null);
            const projectId = p.projectName ? (projIdByName.get(p.projectName) ?? null) : null;
            return {
              id: randomUUID(),
              ledgerId: ledger.id,
              accountId: accId,
              toAccountId,
              type: p.type,
              categoryId,
              projectId,
              amountCents: p.cents,
              currencyCode: fromCur,
              toCurrencyCode: toAccountId ? toCur : null,
              usedRateFrom: fromRate,
              usedRateTo: toAccountId ? toRate : null,
              toAmountCents,
              baseAmountCents,
              txDate: p.date,
              remark: p.remark || null,
              createdBy: user.id,
            };
          });
          await tx.insert(transactions).values(txValues);
          // 标签多对多：按行内解析出的标签名映射 id 后批量写入
          const tagRows: { transactionId: string; tagId: string }[] = [];
          for (let i = 0; i < parsed.length; i++) {
            for (const name of parsed[i].tagNames) {
              const tagId = tagIdByName.get(name);
              if (tagId) tagRows.push({ transactionId: txValues[i].id, tagId });
            }
          }
          if (tagRows.length) await tx.insert(transactionTags).values(tagRows);
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
