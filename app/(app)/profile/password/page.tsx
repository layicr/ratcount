import { redirect } from "next/navigation";
import { requireUser } from "@/lib/scope";
import { getCurrentLedger } from "@/lib/ledger";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PasswordForm } from "./password-form";

/** 修改密码页面 / Change password page */
export default async function PasswordPage() {
  const user = await requireUser();
  const ledger = await getCurrentLedger();
  if (!ledger) redirect("/login");
  const d = getDictionary(await getLocale());

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">{d.profile.changePassword}</h1>
      <PasswordForm />
    </div>
  );
}
