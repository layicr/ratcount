import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { UserForm } from "../user-form";

/** 新增用户页面（仅管理员） */
export default async function NewUserPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) redirect("/login");
  const d = getDictionary(await getLocale());

  // 仅管理员可访问 / Admin only
  if (user.role !== "admin") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{d.settings.adminOnly}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题行：返回链接 + 页面标题 / Title row: back link + page title */}
      <div className="flex items-center gap-3">
        <Link href="/settings/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600">
          <span>←</span>
          <span>{d.userMgmt.title}</span>
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{d.userMgmt.createTitle}</h1>
      </div>
      <UserForm mode="create" />
    </div>
  );
}
