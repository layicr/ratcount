// ratcount · 导出 / 导入（Excel，Node 端生成）/ Export / import (Excel, generated on the Node side)
//  - 数据拼装依赖 lib/queries（Node 专用），因此本模块仅在服务端路由与主进程调用，不在渲染端使用；
//  - XLSX 写盘用 @e965/xlsx（Node / 浏览器双用）：Node 走 workbookToBuffer，浏览器走 workbookToArray。
import { tags, projects, categories } from "@/db/schema";
import { MR, PROJECT_STATUS, TX } from "@/lib/constants";
import { accountTypeCamelKey } from "@/lib/constants";
import { listTransactions, listAccountsWithBalance } from "@/lib/queries";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as XLSX from "@e965/xlsx";
import type { AppDict } from "@/i18n/dict";

export const EXPORT_BATCH = 5000; // 流水分批大小（避免一次性全量载入内存）
export const MAX_EXPORT_ROWS = 50_000; // 单次导出上限（超出直接拒绝，防内存撑爆）

/**
 * 构建导出工作簿：流水 / 账户 / 分类 / 标签 / 项目 五张表。
 *  - dict 由调用方提供（服务端用 getMergedDict，桌面主进程加载本地字典）；
 *  - 流水分页分批拉取并增量写表，同一时刻仅单批驻留内存。
 */
export async function buildExportWorkbook(ledgerId: string, d: AppDict): Promise<XLSX.WorkBook> {
  const [accts, cats, tgs, projs] = await Promise.all([
    listAccountsWithBalance(ledgerId),
    db.select().from(categories).where(eq(categories.ledgerId, ledgerId)),
    db.select().from(tags).where(eq(tags.ledgerId, ledgerId)),
    db.select().from(projects).where(eq(projects.ledgerId, ledgerId)),
  ]);

  const txHeader = [d.common.type, d.common.date, d.common.account, d.add.toAccount, d.tx.category, d.common.project, d.common.amount, d.common.remark, d.tx.tag];
  const acctTypeKey = (type: string): keyof typeof d.acctType => accountTypeCamelKey(type) as keyof typeof d.acctType;

  const wb = XLSX.utils.book_new();

  // 流水：分页分批拉取，逐批追加到 worksheet
  let txWs: XLSX.WorkSheet | undefined;
  let offset = 0;
  let exportedRows = 0;
  for (;;) {
    const batch = await listTransactions(ledgerId, { limit: EXPORT_BATCH, offset });
    if (batch.length === 0) break;
    exportedRows += batch.length;
    if (exportedRows > MAX_EXPORT_ROWS) throw new Error("errors.exportTooLarge");
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
    if (!txWs) txWs = XLSX.utils.aoa_to_sheet([txHeader]);
    XLSX.utils.sheet_add_aoa(txWs, rows, { origin: -1 });
    if (batch.length < EXPORT_BATCH) break;
    offset += EXPORT_BATCH;
  }
  if (!txWs) txWs = XLSX.utils.aoa_to_sheet([txHeader]);
  XLSX.utils.book_append_sheet(wb, txWs, d.nav.transactions);

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      accts.map((a) => ({
        [d.common.name]: a.name,
        类型: d.acctType[acctTypeKey(a.type)] ?? a.type,
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
    XLSX.utils.json_to_sheet(
      cats.map((c) => {
        const typeLabel = c.type === TX.income ? d.common.income : d.common.expense;
        return { 类型: typeLabel, [d.common.name]: c.name, [d.common.icon]: c.icon };
      }),
    ),
    d.tx.category,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tgs.map((t) => ({ [d.common.name]: t.name, [d.tags.color]: t.color }))),
    d.tx.tag,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      projs.map((p) => {
        const statusLabel = p.status === PROJECT_STATUS.active ? d.projects.active : d.projects.completed;
        return { [d.common.name]: p.name, [d.common.icon]: p.icon, [d.projects.budget]: p.budgetCents / 100, 状态: statusLabel };
      }),
    ),
    d.common.project,
  );

  return wb;
}

/** Node 端：工作簿 → Buffer（主进程经 IPC 回传渲染端下载） */
export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/** 浏览器端：工作簿 → Uint8Array（构造 Blob 触发下载） */
export function workbookToArray(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
