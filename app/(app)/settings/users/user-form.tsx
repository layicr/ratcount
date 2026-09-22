"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmButton } from "../../components/confirm";
import { createUser, updateUser } from "@/app/actions/users";
import { ROLE, type UserRole, USER_STATUS, type UserStatus, SETTINGS_USERS_PATH } from "@/lib/constants";

/** 用户表单数据类型 */
type UserFormData = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: UserStatus;
  remark: string;
};

/** 用户表单组件：新增/编辑共用 */
export function UserForm({
  mode,
  initialUser,
}: {
  mode: "create" | "edit";
  initialUser?: UserFormData;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    name: initialUser?.name ?? "",
    email: initialUser?.email ?? "",
    password: "",
    role: (initialUser?.role as UserRole) ?? ROLE.user,
    status: (initialUser?.status as UserStatus) ?? USER_STATUS.active,
    remark: initialUser?.remark ?? "",
  });

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  }

  /**
   * 前端校验：保存前先校验，校验通过才弹确认框 / Validate before confirm
   * - 昵称：1-30 字符
   * - 邮箱：格式校验
   * - 密码（仅新增）：6-72 字符
   * @returns true=校验通过，false=校验失败
   */
  function validateForm(): boolean {
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();

    // 校验昵称 / Validate nickname
    if (!trimmedName) {
      flash(false, t("userMgmt.nameRequired"));
      return false;
    }
    if (trimmedName.length > 30) {
      flash(false, t("userMgmt.nameInvalid"));
      return false;
    }

    // 校验邮箱 / Validate email
    if (!trimmedEmail) {
      flash(false, t("userMgmt.emailRequired"));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      flash(false, t("userMgmt.emailInvalid"));
      return false;
    }

    // 校验密码（仅新增）/ Validate password (create only)
    if (mode === "create") {
      if (!form.password) {
        flash(false, t("errors.passwordRequired"));
        return false;
      }
      if (form.password.length < 6 || form.password.length > 72) {
        flash(false, t("userMgmt.passwordLength"));
        return false;
      }
    }

    return true;
  }

  /** 提交表单 / Submit form */
  async function handleSubmit() {
    if (mode === "edit" && initialUser) {
      // 编辑 / Update
      const r = await updateUser(initialUser.id, {
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
        remark: form.remark,
      });
      if (r.ok) {
        flash(true, t("userMgmt.updated"));
        setTimeout(() => router.push(SETTINGS_USERS_PATH), 1000);
      } else {
        flash(false, t(r.error));
      }
    } else {
      // 新增 / Create
      const r = await createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        status: form.status,
        remark: form.remark,
      });
      if (r.ok) {
        flash(true, t("userMgmt.created"));
        setTimeout(() => router.push(SETTINGS_USERS_PATH), 1000);
      } else {
        flash(false, t(r.error));
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* 消息提示 / Message */}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {/* 表单 / Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          {/* 昵称 / Nickname */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.nickname")}{mode === "create" && <span className="text-red-500">*</span>}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={30}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          {/* 邮箱 / Email（编辑模式下禁用，不可修改） */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("common.email")}{mode === "create" && <span className="text-red-500">*</span>}
              {mode === "edit" && <span className="ml-1 text-slate-400">({t("userMgmt.emailReadOnly")})</span>}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={mode === "edit"}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                mode === "edit"
                  ? "cursor-not-allowed bg-slate-100 text-slate-500 border-slate-200"
                  : "border-slate-200"
              }`}
            />
          </div>
          {/* 密码（仅新增时显示）/ Password (only for create) */}
          {mode === "create" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.password")}<span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
              <p className="mt-1 text-[11px] text-slate-400">{t("errors.passwordHint")}</p>
            </div>
          )}
          {/* 角色 / Role */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("userMgmt.role")}</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value={ROLE.user}>{t("common.user")}</option>
              <option value={ROLE.admin}>{t("common.roleAdmin")}</option>
            </select>
          </div>
          {/* 状态 / Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.status")}</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as UserStatus })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value={USER_STATUS.active}>{t("common.active")}</option>
              <option value={USER_STATUS.disabled}>{t("userMgmt.statusDisabled")}</option>
            </select>
          </div>
          {/* 备注 / Remark */}
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.remark")}</label>
            <input
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              maxLength={200}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>

        {/* 操作按钮 / Action buttons */}
        <div className="mt-4 flex gap-2">
          <ConfirmButton
            action={handleSubmit}
            beforeOpen={validateForm}
            title={mode === "edit" ? t("common.edit") : t("common.add")}
            desc={mode === "edit" ? t("userMgmt.editDesc") : t("common.createDesc")}
            okText={t("common.save")}
            className="flex-1"
          >
            <span className="block w-full rounded-lg bg-teal-600 py-2 text-center text-sm font-semibold text-white hover:bg-teal-700">
              {t("common.save")}
            </span>
          </ConfirmButton>
          <button
            type="button"
            onClick={() => router.push(SETTINGS_USERS_PATH)}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
