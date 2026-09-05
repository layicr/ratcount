import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getMyLedgers, getCurrentLedgerId } from "@/lib/ledger";
import { getSetting } from "@/lib/settings";
import { getLocale, getDictionary } from "@/lib/i18n";
import { AppShell } from "./app-shell";

/** 应用布局：登录后才能进入（scopeGuard） */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const ledgers = await getMyLedgers(user.id);
  const currentId = await getCurrentLedgerId();
  const copyright = (await getSetting("copyright")) ?? "© 2026 ratcount";
  const locale = await getLocale();
  // 根据当前语言选择应用名称 / Select app name based on current locale
  const appNameZh = (await getSetting("app_name_zh")) ?? "ratcount";
  const appNameEn = (await getSetting("app_name_en")) ?? "ratcount";
  const appName = locale === "zh" ? (appNameZh || "ratcount") : (appNameEn || "ratcount");
  // 根据当前语言选择应用宣言 / Select app slogan based on current locale
  const appSloganZh = (await getSetting("app_slogan_zh")) ?? "";
  const appSloganEn = (await getSetting("app_slogan_en")) ?? "";
  const appSlogan = locale === "zh" ? appSloganZh : appSloganEn;
  const d = getDictionary(locale);

  if (!currentId || ledgers.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow">
          <h1 className="text-lg font-bold text-slate-900">{d.layout.noLedger}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {d.layout.noLedgerDesc}
          </p>
        </div>
      </main>
    );
  }

  const current = ledgers.find((l) => l.ledger.id === currentId)?.ledger;

  return (
    <AppShell
      userName={user.name ?? "用户"}
      userRole={user.role}
      appName={appName}
      appSlogan={appSlogan}
      ledgers={ledgers.map((l) => ({
        id: l.ledger.id,
        name: l.ledger.name,
        icon: l.ledger.icon,
      }))}
      currentId={currentId}
      currentName={current?.name ?? ""}
      copyright={copyright}
    >
      {children}
    </AppShell>
  );
}
