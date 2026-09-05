import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { ProfilePanel } from "./profile-panel";

/** 个人设置：风格 / 语言 / 数据管理 + 管理功能入口（移动端底部"我的"tab 访问） */
export default async function ProfilePage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) redirect("/login");
  const d = getDictionary(await getLocale());

  /** 管理功能入口（label 直接用强类型 d.nav，避免动态索引 TS 错误） */
  const manageLinks = [
    { href: "/ledgers", icon: "📒", label: d.nav.ledgers },
    { href: "/accounts", icon: "💳", label: d.nav.accounts },
    { href: "/balance", icon: "⚖️", label: d.nav.balance },
    { href: "/projects", icon: "📁", label: d.nav.projects },
    { href: "/recurring", icon: "🔁", label: d.nav.recurring },
    { href: "/categories", icon: "📂", label: d.nav.categories },
    { href: "/tags", icon: "🏷️", label: d.nav.tags },
    { href: "/settings", icon: "⚙️", label: d.nav.settings },
  ];

  // 根据用户角色过滤管理功能入口：普通用户不显示全局设置 / Filter by user role
  const filteredManageLinks = manageLinks.filter((item) => {
    if (item.href === "/settings") {
      return user.role === "admin";
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.profile.title}</h1>
      <ProfilePanel userName={user.name ?? ""} email={user.email ?? ""} />

      {/* 管理功能入口网格（移动端主要入口，桌面端也可见） */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{d.profile.manage}</h2>
        <div className="grid grid-cols-4 gap-2">
          {filteredManageLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-center transition hover:bg-teal-50"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] text-slate-600">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
