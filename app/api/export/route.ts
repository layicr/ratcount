import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { listTransactions, listAccountsWithBalance, ACCOUNT_TYPE_LABELS } from "@/lib/queries";
import { db } from "@/lib/db";
import { categories, tags, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLocale, getDictionary } from "@/lib/i18n";
import * as XLSX from "xlsx";

/** 导出 Excel：流水 / 账户 / 分类 / 标签 / 项目 五张表 */
export async function GET() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) return Response.json({ error: d.errors.noLedger }, { status: 400 });

  const [txs, accts, cats, tgs, projs] = await Promise.all([
    listTransactions(ledger.id, {}),
    listAccountsWithBalance(ledger.id),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
    db.select().from(tags).where(eq(tags.ledgerId, ledger.id)),
    db.select().from(projects).where(eq(projects.ledgerId, ledger.id)),
  ]);

  const typeLabel: Record<string, string> = { income: "收入", expense: "支出", transfer: "转账" };

  const wb = XLSX.utils.book_new();

  const txRows = txs.map((t) => ({
    类型: typeLabel[t.type] ?? t.type,
    日期: t.txDate,
    账户: t.account?.name ?? "",
    转入账户: t.toAccount?.name ?? "",
    分类: t.category?.name ?? "",
    项目: t.project?.name ?? "",
    金额: t.amountCents / 100,
    备注: t.remark ?? "",
    标签: t.tagList.map((x) => x.name).join("、"),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "流水");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      accts.map((a) => ({
        名称: a.name, 类型: ACCOUNT_TYPE_LABELS[a.type] ?? a.type, 图标: a.icon,
        币种: a.currencyCode, 期初余额: a.openingBalanceCents / 100,
        计入资产: a.isAsset ? "是" : "否", 备注: a.remark ?? "",
      })),
    ),
    "账户",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cats.map((c) => ({ 类型: c.type === "income" ? "收入" : "支出", 名称: c.name, 图标: c.icon }))),
    "分类",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tgs.map((t) => ({ 名称: t.name, 颜色: t.color }))),
    "标签",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(projs.map((p) => ({ 名称: p.name, 图标: p.icon, 预算: p.budgetCents / 100, 状态: p.status === "active" ? "进行中" : "已完成" }))),
    "项目",
  );

  // 查询/导出类操作不记录审计日志（按需求：查询的日志不记录）

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ratcount-export-${date}.xlsx"`,
    },
  });
}
