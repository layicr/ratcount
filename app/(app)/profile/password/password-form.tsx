"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../../components/confirm";
import { changePassword } from "@/app/actions/profile";

/** 修改密码表单 / Change password form */
export function PasswordForm() {
  const t = useT();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  }

  /** 表单校验 / Form validation - 返回 true 表示校验通过 */
  function validateForm(): boolean {
    if (!oldPassword) {
      flash(false, t("profile.oldPasswordRequired"));
      return false;
    }
    if (newPassword.length < 6 || newPassword.length > 72) {
      flash(false, t("profile.passwordLength"));
      return false;
    }
    if (newPassword !== confirmPassword) {
      flash(false, t("profile.passwordMismatch"));
      return false;
    }
    if (oldPassword === newPassword) {
      flash(false, t("profile.passwordSame"));
      return false;
    }
    return true;
  }

  /** 提交修改密码 / Submit password change */
  async function handleSubmit() {
    const r = await changePassword(oldPassword, newPassword);
    if (r.ok) {
      flash(true, t("profile.passwordChanged"));
      // 清空表单 / Clear form
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // 3秒后退出登录，要求用新密码重新登录 / Sign out after 3 seconds
      setTimeout(async () => {
        await signOut({ callbackUrl: "/login" });
      }, 2000);
    } else {
      flash(false, t(r.error) !== r.error ? t(r.error) : r.error);
    }
  }

  /** 密码强度提示 / Password strength hint */
  function getStrength(pwd: string): { level: number; text: string; color: string } {
    if (!pwd) return { level: 0, text: "", color: "" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { level: 1, text: t("profile.strengthWeak"), color: "bg-red-500" };
    if (score <= 2) return { level: 2, text: t("profile.strengthMedium"), color: "bg-yellow-500" };
    if (score <= 3) return { level: 3, text: t("profile.strengthStrong"), color: "bg-green-500" };
    return { level: 4, text: t("profile.strengthVeryStrong"), color: "bg-teal-600" };
  }

  const strength = getStrength(newPassword);

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      {/* 旧密码 / Old password */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("profile.oldPassword")}</label>
        <div className="relative">
          <input
            type={showOld ? "text" : "password"}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            type="button"
            onClick={() => setShowOld(!showOld)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600"
            title={showOld ? t("profile.hide") : t("profile.show")}
          >
            {showOld ? "👁️" : "🔒"}
          </button>
        </div>
      </div>

      {/* 新密码 / New password */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("profile.newPassword")}</label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600"
            title={showNew ? t("profile.hide") : t("profile.show")}
          >
            {showNew ? "👁️" : "🔒"}
          </button>
        </div>
        {/* 密码强度指示器 / Password strength indicator */}
        {newPassword && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= strength.level ? strength.color : "bg-slate-200"}`}
                />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{strength.text}</p>
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-400">{t("profile.passwordHint")}</p>
      </div>

      {/* 确认新密码 / Confirm new password */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("profile.confirmPassword")}</label>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600"
            title={showConfirm ? t("profile.hide") : t("profile.show")}
          >
            {showConfirm ? "👁️" : "🔒"}
          </button>
        </div>
        {confirmPassword && confirmPassword !== newPassword && (
          <p className="mt-1 text-[11px] text-red-500">{t("profile.passwordMismatch")}</p>
        )}
      </div>

      {/* 消息提示 / Message */}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {/* 操作按钮 / Action buttons */}
      <div className="flex gap-2">
        <ConfirmButton
          action={handleSubmit}
          beforeOpen={validateForm}
          title={t("profile.changePasswordTitle")}
          desc={t("profile.changePasswordDesc")}
          okText={t("profile.confirmChange")}
          className="flex-1"
        >
          <span className="block w-full rounded-lg bg-teal-600 py-2 text-center text-sm font-semibold text-white hover:bg-teal-700">
            {t("profile.confirmChange")}
          </span>
        </ConfirmButton>
        <button
          type="button"
          onClick={() => router.push("/profile")}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-sm text-slate-600 hover:bg-slate-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
