import { requireUser } from "@/lib/scope";
import { requireCurrentLedger } from "@/lib/ledger";
import { PasswordForm } from "./password-form";
import { getMessages } from "next-intl/server";
import type { AppDict } from "@/i18n/dict";

/** 修改密码页面 / Change password page */
export default async function PasswordPage() {
  await requireUser();
  await requireCurrentLedger();
  const d = (await getMessages()) as unknown as AppDict;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.profile.changePassword}</h1>
      <PasswordForm />
    </div>
  );
}
