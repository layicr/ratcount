"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import { computeTotalPages } from "@/lib/pagination-util";
import { ConfirmButton, DeleteButton } from "../../components/confirm";
import { Pagination } from "../../components/pagination";
import { deleteUser, resetUserPassword } from "@/app/actions/users";
import { ROLE, USER_STATUS, SETTINGS_USERS_PATH } from "@/lib/constants";

/** 用户类型 / User type */
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 用户管理组件：列表 + 搜索 + 跳转新增/编辑 + 删除/重置密码 + 分页 */
export function UsersManager({
  initialUsers,
  initialSearch,
  currentUserId,
  total,
  page,
  pageSize,
  allowedPageSizes,
}: {
  initialUsers: User[];
  initialSearch: string;
  currentUserId: string;
  total: number;
  page: number;
  pageSize: number;
  allowedPageSizes: number[];
}) {
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const totalPages = computeTotalPages(total, pageSize);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  }

  /** 搜索 / Search */
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const url = `${SETTINGS_USERS_PATH}?q=${encodeURIComponent(search)}&page=1&pageSize=${pageSize}`;
    router.push(url);
  }

  /** 删除用户 / Delete user */
  async function handleDelete(user: User) {
    const r = await deleteUser(user.id);
    if (r.ok) {
      flash(true, t("userMgmt.deleted"));
      router.refresh();
    } else {
      flash(false, t(r.error));
    }
  }

  /** 重置密码 / Reset password */
  async function handleResetPassword() {
    if (!resetTarget) return;
    if (!newPassword) return;
    const r = await resetUserPassword(resetTarget.id, newPassword);
    if (r.ok) {
      flash(true, t("userMgmt.passwordReset"));
      setResetTarget(null);
      setNewPassword("");
    } else {
      flash(false, t(r.error));
    }
  }

  /** 角色标签 / Role badge */
  function RoleBadge({ role }: { role: string }) {
    if (role === ROLE.admin) {
      return <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">{t("common.roleAdmin")}</span>;
    }
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{t("common.user")}</span>;
  }

  /** 状态标签 / Status badge */
  function StatusBadge({ status }: { status: string }) {
    if (status === USER_STATUS.active) {
      return <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">{t("common.active")}</span>;
    }
    return <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">{t("userMgmt.statusDisabled")}</span>;
  }

  return (
    <div className="space-y-4">
      {/* 消息提示 / Message */}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {/* 工具栏：新增（居左） + 搜索 / Toolbar: create (left) + search */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${SETTINGS_USERS_PATH}/new`}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("common.add")}
        </Link>
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}

            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {t("common.filter")}
          </button>
          <button
            type="button"
            onClick={() => { setSearch(""); router.push(`${SETTINGS_USERS_PATH}?page=1&pageSize=${pageSize}`); }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            {t("common.clear")}
          </button>
        </form>
      </div>

      {/* 用户列表 / User list */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">{t("userMgmt.userId")}</th>
              <th className="px-4 py-3 font-medium">{t("common.nickname")}</th>
              <th className="px-4 py-3 font-medium">{t("common.email")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.role")}</th>
              <th className="px-4 py-3 font-medium">{t("common.status")}</th>
              <th className="px-4 py-3 font-medium">{t("common.createdAt")}</th>
              <th className="px-4 py-3 font-medium">{t("common.updatedAt")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t("common.empty")}
                </td>
              </tr>
            ) : (
              initialUsers.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  {/* 用户编号 / User ID */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-500">{user.id.substring(0, 8)}...</span>
                  </td>
                  {/* 昵称 / Nickname */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-slate-800">{user.name}</span>
                      {user.id === currentUserId && (
                        <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-700">{t("userMgmt.you")}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {f.dateTime(new Date(user.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {f.dateTime(new Date(user.updatedAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* 编辑（跳转新页面）/ Edit (navigate to new page) */}
                      <Link
                        href={`${SETTINGS_USERS_PATH}/${user.id}/edit`}
                        className="rounded px-2 py-1 text-xs text-teal-600 hover:bg-teal-50"
                      >
                        {t("common.edit")}
                      </Link>
                      {/* 重置密码 / Reset password */}
                      <button
                        type="button"
                        onClick={() => { setResetTarget(user); setNewPassword(""); }}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        {t("userMgmt.resetPassword")}
                      </button>
                      {/* 删除 / Delete */}
                      {user.id !== currentUserId && (
                        <DeleteButton
                          action={() => handleDelete(user)}
                          title={t("userMgmt.deleteTitle")}
                          desc={t("userMgmt.deleteDesc", { name: user.name, email: user.email })}
                          okText={t("common.delete")}
                          label={<span className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">{t("common.delete")}</span>}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 分页控件（全局共用） */}
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          basePath={SETTINGS_USERS_PATH}
          q={search}
          allowedPageSizes={allowedPageSizes}
          unit={t("userMgmt.unit")}
          onNavigate={(href) => router.push(href)}
        />
      </div>

      {/* 重置密码弹窗 / Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-bold text-slate-900">{t("userMgmt.resetPasswordTitle")}</h3>
            <p className="mb-4 text-sm text-slate-500">
              {t("userMgmt.resetPasswordDesc", { name: resetTarget.name, email: resetTarget.email })}
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("userMgmt.newPassword")}
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            {!newPassword && (
              <p className="mb-4 text-[11px] text-red-500">{t("userMgmt.newPasswordRequired")}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <ConfirmButton
                action={handleResetPassword}
                title={t("userMgmt.resetPasswordTitle")}
                desc={t("userMgmt.resetPasswordConfirm")}
                okText={t("userMgmt.confirmReset")}
                disabled={!newPassword}
                className="flex-1"
              >
                <span className="block w-full rounded-lg bg-blue-600 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700">
                  {t("userMgmt.confirmReset")}
                </span>
              </ConfirmButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
