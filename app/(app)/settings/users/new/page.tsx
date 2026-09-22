import Link from "next/link";
import { requireUser } from "@/lib/scope"
import { ROLE, SETTINGS_USERS_PATH } from "@/lib/constants";
import { requireCurrentLedger } from "@/lib/ledger";
import { UserForm } from "../user-form";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 新增用户页面（仅管理员） */
export default async function NewUserPage() {
  const user = await requireUser();
  const ledger = await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  // 仅管理员可访问 / Admin only
  if (user.role !== ROLE.admin) {
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
        <Link href={SETTINGS_USERS_PATH} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600">
          <span>←</span>
          <span>{d.userMgmt.title}</span>
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{d.common.add}</h1>
      </div>
      <UserForm mode="create" />
    </div>
  );
}
