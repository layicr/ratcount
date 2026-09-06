import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { listTransactions, listAccountsWithBalance } from "@/lib/queries";
import { db } from "@/lib/db";
import { categories, tags, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLocale, getDictionary } from "@/lib/i18n";
import * as XLSX from "@e965/xlsx";

/** 导出 Excel：流水 / 账户 / 分类 / 标签 / 项目 五张表 */
export async function GET() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getDictionary(await getLocale());
  if (!ledger) return Response.json({ error: d.errors.noLedger }, { status: 400 });

  // 账户/分类/标签/项目数据量小，全量加载；流水分页分批拉取并增量写表，避免一次性把全量流水载入内存
  const [accts, cats, tgs, projs] = await Promise.all([
    listAccountsWithBalance(ledger.id),
    db.select().from(categories).where(eq(categories.ledgerId, ledger.id)),
    db.select().from(tags).where(eq(tags.ledgerId, ledger.id)),
    db.select().from(projects).where(eq(projects.ledgerId, ledger.id)),
  ]);

  const TX_BATCH = 5000;
  const txHeader = [d.tx.type, d.tx.date, d.tx.account, d.add.toAccount, d.tx.category, d.tx.project, d.tx.amount, d.common.remark, d.tx.tag];

  // 账户类型：DB 存 snake_case，i18n 用 camelCase key，做一层映射
  const acctTypeKey: Record<string, keyof typeof d.acctType> = {
    cash: "cash", debit_card: "debitCard", credit_card: "creditCard", wechat: "wechat",
    savings: "savings", investment: "investment", fund: "fund", precious_metal: "preciousMetal",
    bond: "bond", foreign_currency: "foreignCurrency", real_estate: "realEstate", custom: "custom",
  };

  const wb = XLSX.utils.book_new();

  // 流水：分页分批拉取，逐批追加到 worksheet（同一时刻只有单批交易对象驻留内存）
  let txWs: XLSX.WorkSheet | undefined;
  let offset = 0;
  for (;;) {
    const batch = await listTransactions(ledger.id, { limit: TX_BATCH, offset });
    if (batch.length === 0) break;
    const rows = batch.map((t) => [
      d.common[t.type] ?? t.type,
      t.txDate,
      t.account?.name ?? "",
      t.toAccount?.name ?? "",
      t.category?.name ?? "",
      t.project?.name ?? "",
      t.amountCents / 100,
      t.remark ?? "",
      t.tagList.map((x) => x.name).join("、"),
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
      accts.map((a) => ({
        [d.common.name]: a.name,
        类型: d.acctType[acctTypeKey[a.type] ?? "custom"] ?? a.type,
        [d.common.icon]: a.icon,
        [d.settings.currency]: a.currencyCode,
        [d.accounts.opening]: a.openingBalanceCents / 100,
        [d.accounts.isAsset]: a.isAsset ? d.common.yes : d.common.no,
        [d.common.remark]: a.remark ?? "",
      })),
    ),
    d.nav.accounts,
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cats.map((c) => {
      const typeLabel = c.type === "income" ? d.common.income : d.common.expense;
      return {
        类型: typeLabel,
        [d.common.name]: c.name,
        [d.common.icon]: c.icon,
      };
    })),
    d.tx.category,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tgs.map((t) => ({ [d.common.name]: t.name, [d.tags.color]: t.color }))),
    d.tx.tag,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(projs.map((p) => {
      const statusLabel = p.status === "active" ? d.projects.active : d.projects.completed;
      return {
        [d.common.name]: p.name,
        [d.common.icon]: p.icon,
        [d.projects.budget]: p.budgetCents / 100,
        状态: statusLabel,
      };
    })),
    d.tx.project,
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
