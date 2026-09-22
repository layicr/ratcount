// ratcount · 账本业务服务 / Ledger business service
//  - 从 app/actions/ledgers 抽出的「校验 + 审计 + 写库」纯逻辑（不依赖 'use server'），服务端 action 与桌面 IPC 共用。
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ledgerMembers, ledgers } from "@/db/schema";
import { AUDIT_ACTION, ENTITY, DEFAULT_CURRENCY, DEFAULT_LEDGER_ICON, MR } from "@/lib/constants";
import { withAudit } from "@/lib/audit";
import { cascadeDeleteLedger } from "@/lib/cascade";
import { type Actor } from "./guard";

const ledgerSchema = z.object({
  name: z.string().min(1).max(30),
  icon: z.string().max(4).optional(),
  baseCurrencyCode: z.string().min(1).max(8).optional(),
  remark: z.string().max(200).optional(),
});
export type LedgerInput = z.infer<typeof ledgerSchema>;

type Ok = { ok: true; error: null };
type Fail = { ok: false; error: string };
type LedgerResult = Ok | Fail | { ok: true; id: string };

/* ===================== 账本 / Ledgers ===================== */

/** 新增账本（创建者自动成为 owner）/ Create ledger, creator becomes owner */
export async function createLedgerService(actor: Actor, input: LedgerInput): Promise<LedgerResult> {
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;

  let ledgerId = "";
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.create,
      entity: ENTITY.ledger,
      summaryKey: "audit.ledgerCreated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ name: d.name, icon: d.icon ?? DEFAULT_LEDGER_ICON, baseCurrencyCode: d.baseCurrencyCode ?? DEFAULT_CURRENCY }),
      responseBody: '{"result":"created"}',
    },
    async (tx) => {
      const [ledger] = await tx
        .insert(ledgers)
        .values({
          name: d.name,
          icon: d.icon ?? DEFAULT_LEDGER_ICON,
          baseCurrencyCode: d.baseCurrencyCode ?? DEFAULT_CURRENCY,
          remark: d.remark ?? null,
          createdBy: actor.id,
        })
        .returning();
      ledgerId = ledger.id;
      await tx.insert(ledgerMembers).values({ ledgerId: ledger.id, userId: actor.id, role: MR.owner });
    },
  );
  return { ok: true, id: ledgerId };
}

/** 更新账本（仅 owner，调用方保证）/ Update ledger (owner only) */
export async function updateLedgerService(actor: Actor, ledgerId: string, input: LedgerInput): Promise<LedgerResult> {
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.invalidInput" };
  const d = parsed.data;

  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.update,
      entity: ENTITY.ledger,
      entityId: ledgerId,
      summaryKey: "audit.ledgerUpdated",
      summaryParams: { name: d.name },
      requestBody: JSON.stringify({ name: d.name, icon: d.icon ?? DEFAULT_LEDGER_ICON, baseCurrencyCode: d.baseCurrencyCode ?? DEFAULT_CURRENCY, remark: d.remark ?? null }),
      responseBody: '{"result":"updated"}',
    },
    async (tx) => {
      await tx.update(ledgers).set({
        name: d.name,
        icon: d.icon ?? DEFAULT_LEDGER_ICON,
        baseCurrencyCode: d.baseCurrencyCode ?? DEFAULT_CURRENCY,
        remark: d.remark ?? null,
      }).where(eq(ledgers.id, ledgerId));
    },
  );
  return { ok: true, error: null };
}

/** 删除账本（仅 owner），级联删除该账本下所有数据 / Delete ledger (owner only), cascade delete all data */
export async function deleteLedgerService(actor: Actor, ledgerId: string): Promise<LedgerResult> {
  await withAudit(
    {
      userId: actor.id,
      action: AUDIT_ACTION.delete,
      entity: ENTITY.ledger,
      entityId: ledgerId,
      summaryKey: "audit.ledgerDeleted",
      summaryParams: {},
      requestBody: JSON.stringify({ ledgerId }),
      responseBody: '{"result":"deleted"}',
    },
    async (tx) => {
      await cascadeDeleteLedger(tx, ledgerId);
    },
  );
  return { ok: true, error: null };
}
