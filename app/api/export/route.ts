import { MR } from "@/lib/constants";
import { requireLedgerAccess, requireUser } from "@/lib/scope";
import { allowAttempt, EXPORT_LIMIT } from "@/lib/auth/rate-limit";
import { getCurrentLedger } from "@/lib/ledger";
import { getMergedDict, readLocale } from "@/i18n/dict";
import { buildExportWorkbook, workbookToBuffer } from "@/lib/io/excel";

/** 导出 Excel：流水 / 账户 / 分类 / 标签 / 项目 五张表（服务端路由，桌面改由主进程复用同一逻辑） */
export async function GET() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  const d = getMergedDict(await readLocale());
  if (!ledger) return Response.json({ error: d.errors.noLedger }, { status: 400 });

  // 导出是重操作：确认账本成员身份（viewer 亦可）+ 按用户限流 + 限制行数，避免资源耗尽型 DoS
  await requireLedgerAccess(ledger.id, MR.viewer);
  if (!allowAttempt(`export:${user.id}`, EXPORT_LIMIT)) {
    return Response.json({ error: d.errors.tooManyRequests }, { status: 429 });
  }

  // 查询/导出类操作不记录审计日志（按需求：查询的日志不记录）
  let wb;
  try {
    wb = await buildExportWorkbook(ledger.id, d);
  } catch (e) {
    if (e instanceof Error && e.message === "errors.exportTooLarge") {
      return Response.json({ error: d.errors.exportTooLarge }, { status: 413 });
    }
    throw e;
  }

  const buf = workbookToBuffer(wb);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ratcount-export-${date}.xlsx"`,
    },
  });
}
