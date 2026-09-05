import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import * as XLSX from "xlsx";

/** 下载导入模板（.xlsx）：流水表含示例行，另附填写说明 sheet */
export async function GET() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) return Response.json({ error: "no ledger" }, { status: 400 });

  const wb = XLSX.utils.book_new();

  // 流水表：列头 + 示例行（与 /api/import 解析字段保持一致）
  const txRows = [
    { 类型: "收入", 日期: "2026-09-05", 账户: "现金", 转入账户: "", 分类: "工资", 项目: "", 金额: 1000, 备注: "示例：收入", 标签: "" },
    { 类型: "支出", 日期: "2026-09-05", 账户: "现金", 转入账户: "", 分类: "餐饮", 项目: "", 金额: 25.5, 备注: "示例：支出", 标签: "" },
    { 类型: "转账", 日期: "2026-09-06", 账户: "现金", 转入账户: "招行储蓄卡", 分类: "", 项目: "", 金额: 500, 备注: "示例：转账", 标签: "" },
  ];
  const ws = XLSX.utils.json_to_sheet(txRows);
  // 列宽
  ws["!cols"] = [
    { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "流水");

  // 填写说明
  const guideRows = [
    { 字段: "类型", 必填: "是", 取值: "收入 / 支出 / 转账", 示例: "收入" },
    { 字段: "日期", 必填: "是", 取值: "YYYY-MM-DD", 示例: "2026-09-05" },
    { 字段: "账户", 必填: "是", 取值: "已存在账户名则匹配；不存在则自动创建", 示例: "现金" },
    { 字段: "转入账户", 必填: "否", 取值: "仅转账类型填写，指转入方账户", 示例: "招行储蓄卡" },
    { 字段: "分类", 必填: "否", 取值: "已存在分类名则匹配；不存在则自动创建；转账留空", 示例: "餐饮" },
    { 字段: "项目", 必填: "否", 取值: "已存在项目名则匹配；不存在则自动创建", 示例: "" },
    { 字段: "金额", 必填: "是", 取值: "数字，单位：元，大于 0", 示例: "25.5" },
    { 字段: "备注", 必填: "否", 取值: "任意文字", 示例: "午饭" },
    { 字段: "标签", 必填: "否", 取值: "多个标签用「、」分隔", 示例: "" },
    { 字段: "", 必填: "", 取值: "注意：请删除示例行后再上传；单次最多 1000 行；支持 .xlsx / .csv", 示例: "" },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideRows);
  guideWs["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 62 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, guideWs, "填写说明");

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
