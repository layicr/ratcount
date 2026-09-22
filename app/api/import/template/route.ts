import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import * as XLSX from "@e965/xlsx";
import { readLocale, getMergedDict } from "@/i18n/dict";

/** 下载导入模板（.xlsx）：流水表含示例行，另附填写说明 sheet */
export async function GET() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) return Response.json({ error: "no ledger" }, { status: 400 });
  const locale = await readLocale();
  const d = getMergedDict(locale);

  const wb = XLSX.utils.book_new();

  // 流水表：列头 + 示例行（表头/类型标签按当前语言本地化，与 /api/import 解析字段保持一致）
  const txHeader = [d.common.type, d.common.date, d.common.account, d.add.toAccount, d.tx.category, d.common.project, d.common.amount, d.common.remark, d.tx.tag];
  const txRows = [
    [d.common.income, "2026-09-05", "现金", "", "工资", "", 1000, d.common.income, ""],
    [d.common.expense, "2026-09-05", "现金", "", "餐饮", "", 25.5, d.common.expense, ""],
    [d.common.transfer, "2026-09-06", "现金", "招行储蓄卡", "", "", 500, d.common.transfer, ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([txHeader, ...txRows]);
  // 列宽
  ws["!cols"] = [
    { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, d.nav.transactions);

  // 填写说明（按当前语言本地化）
  const typeValues = `${d.common.income} / ${d.common.expense} / ${d.common.transfer}`;
  const guideRows = [
    { [d.import.field]: d.common.type, [d.import.required]: d.common.yes, [d.import.allowed]: typeValues, [d.import.example]: d.common.income },
    { [d.import.field]: d.common.date, [d.import.required]: d.common.yes, [d.import.allowed]: "YYYY-MM-DD", [d.import.example]: "2026-09-05" },
    { [d.import.field]: d.common.account, [d.import.required]: d.common.yes, [d.import.allowed]: d.import.accountHint, [d.import.example]: "现金" },
    { [d.import.field]: d.add.toAccount, [d.import.required]: d.common.no, [d.import.allowed]: d.import.toAccountHint, [d.import.example]: "招行储蓄卡" },
    { [d.import.field]: d.tx.category, [d.import.required]: d.common.no, [d.import.allowed]: d.import.categoryHint, [d.import.example]: "餐饮" },
    { [d.import.field]: d.common.project, [d.import.required]: d.common.no, [d.import.allowed]: d.import.projectHint, [d.import.example]: "" },
    { [d.import.field]: d.common.amount, [d.import.required]: d.common.yes, [d.import.allowed]: d.import.amountHint, [d.import.example]: "25.5" },
    { [d.import.field]: d.common.remark, [d.import.required]: d.common.no, [d.import.allowed]: d.import.remarkHint, [d.import.example]: d.import.remarkExample },
    { [d.import.field]: d.tx.tag, [d.import.required]: d.common.no, [d.import.allowed]: d.import.tagHint, [d.import.example]: "" },
    { [d.import.field]: "", [d.import.required]: "", [d.import.allowed]: d.import.guideNote, [d.import.example]: "" },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideRows);
  guideWs["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 62 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, guideWs, d.import.guide);

  // 模板下载不写审计日志（查询/导出类操作不记录）
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ratcount-import-template-${date}.xlsx"`,
    },
  });
}
