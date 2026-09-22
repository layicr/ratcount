import Link from "next/link";
import { formatCurrency } from "@/lib/money";
import { listAccountsWithBalance, listTransactions, listRecurringPlans } from "@/lib/queries";
import { accountTypeIcon, accountTypeI18nKey, TX, type AccountType, RECURRING_STATUS } from "@/lib/constants";
import { TxTypeBadge } from "./badges";
import { BAR_COLORS } from "@/lib/chart-colors";
import { getMessages, getLocale } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 保障类账户汇总（统计卡 + 分类小计 + 近期流水 + 缴费计划 + 空态）—— /protection 使用 */
export async function AccountGroupSummary({
  ledgerId,
  types,
  d,
  currency,
}: {
  ledgerId: string;
  types: readonly string[];
  d: AppDict;
  currency: string;
}) {
  const locale = await getLocale();
  const dict = d ?? (await getMessages()) as unknown as AppDict;
  const money = (c: number) => formatCurrency(c, currency, locale);
  // 动态 i18n 键取值（账户类型 / 流水类型 / 频率 均为运行时拼接，用兜底避免缺键报错）
  const get = (k: string): string => {
    const parts = k.split(".");
    let v: unknown = dict;
    for (const p of parts) {
      if (v && typeof v === "object" && p in v) v = (v as Record<string, unknown>)[p];
      else return k;
    }
    return typeof v === "string" ? v : k;
  };
  const all = await listAccountsWithBalance(ledgerId);
  const protectionAccts = all.filter((a) => types.includes(a.type));
  const totalAssets = all.filter((a) => a.isAsset).reduce((s, a) => s + a.balanceCents, 0);
  const protectionTotal = protectionAccts.reduce((s, a) => s + a.balanceCents, 0);
  const ratio = totalAssets > 0 ? Math.round((protectionTotal / totalAssets) * 100) : 0;
  const ids = new Set(protectionAccts.map((a) => a.id));
  const typeTotals = types.map((t) => ({
    type: t,
    total: protectionAccts.filter((a) => a.type === t).reduce((s, a) => s + a.balanceCents, 0),
  }));

  // 近期流水：拉取全量后按保障账户集合内存过滤，取 20 条
  const txs = (await listTransactions(ledgerId, { limit: 100 })).filter(
    (r) => (r.accountId && ids.has(r.accountId)) || (r.toAccountId && ids.has(r.toAccountId)),
  ).slice(0, 20);

  // 缴费计划：关联保障账户的周期计划
  const plans = (await listRecurringPlans(ledgerId)).filter(
    (p) => (p.accountId && ids.has(p.accountId)) || (p.toAccountId && ids.has(p.toAccountId)),
  );

  return (
    <div className="space-y-4">
      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{dict.protection.totalAssets}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{money(protectionTotal)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{dict.protection.accountCount}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{protectionAccts.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{dict.protection.assetRatio}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{ratio}%</div>
        </div>
      </div>

      {/* 分类小计 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{dict.protection.typeSummary}</h2>
        {typeTotals.every((t) => t.total === 0) ? (
          <p className="py-6 text-center text-sm text-slate-400">{dict.protection.noAccount}</p>
        ) : (
          <div className="space-y-3">
            {typeTotals.map((t, i) => {
              const pct = protectionTotal > 0 ? Math.round((t.total / protectionTotal) * 100) : 0;
              return (
                <div key={t.type}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      <span className="mr-1">{accountTypeIcon(t.type as AccountType)}</span>
                      {get(accountTypeI18nKey(t.type))}
                    </span>
                    <span className="text-slate-400">{money(t.total)} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 近期流水 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{dict.common.recentTx}</h2>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{dict.common.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="py-2 font-normal">{dict.common.date}</th>
                  <th className="py-2 font-normal">{dict.common.type}</th>
                  <th className="py-2 font-normal">{dict.common.account}</th>
                  <th className="py-2 font-normal">{dict.common.project}</th>
                  {/* 摘要列左内边距：项目列内容常为「-」会被压窄，避免两列贴在一起 */}
                  <th className="py-2 pl-4 font-normal">{dict.tx.summary}</th>
                  <th className="py-2 font-normal">{dict.tx.tag}</th>
                  <th className="py-2 text-right font-normal">{dict.common.amount}</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-400">{r.txDate}</td>
                    <td className="py-2"><TxTypeBadge type={r.type} /></td>
                    <td className="py-2 text-slate-500">
                      {/* 账户列与流水页保持一致：图标 + 名称；转账显示「出 → 入」 */}
                      {r.account ? `${r.account.icon} ${r.account.name}` : "-"}
                      {r.toAccount ? ` → ${r.toAccount.icon} ${r.toAccount.name}` : ""}
                    </td>
                    <td className="py-2 text-slate-500">{r.project ? `${r.project.icon} ${r.project.name}` : "-"}</td>
                    <td className="max-w-[160px] truncate py-2 pl-4 text-slate-600">{r.remark ?? "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.tagList.map((tg) => (
                          <span
                            key={tg.name}
                            className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{ background: `${tg.color}22`, color: tg.color }}
                          >
                            {tg.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`py-2 text-right font-medium ${r.type === TX.income ? "text-green-600" : r.type === TX.expense ? "text-red-600" : "text-slate-500"}`}>
                      {r.type === TX.income ? "+" : r.type === TX.expense ? "-" : ""}{money(r.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 缴费计划 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{dict.protection.paymentPlan}</h2>
        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{dict.common.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-left font-normal">{dict.protection.planName}</th>
                <th className="text-left font-normal">{dict.common.amount}</th>
                <th className="text-left font-normal">{dict.common.frequency}</th>
                <th className="text-left font-normal">{dict.protection.nextDate}</th>
                <th className="text-left font-normal">{dict.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-600">{p.name}</td>
                  <td className="py-2 text-left text-slate-700">{money(p.amountCents)}</td>
                  <td className="py-2 text-slate-600">{get(`common.freq${p.frequency.charAt(0).toUpperCase() + p.frequency.slice(1)}`)}</td>
                  <td className="py-2 text-slate-500">{p.nextDate}</td>
                  <td className="py-2 text-slate-500">{p.status === RECURRING_STATUS.active ? dict.common.active : dict.common.paused}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
