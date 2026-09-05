"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { ConfirmButton } from "../../components/confirm";
import { deleteUser, resetUserPassword } from "@/app/actions/users";

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

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm / Format datetime to YYYY-MM-DD HH:mm
 */
function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  }

  /** 搜索 / Search */
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const url = `/settings/users?q=${encodeURIComponent(search)}&page=1&pageSize=${pageSize}`;
    router.push(url);
  }

  /** 切换页码 / Change page */
  function goToPage(p: number) {
    const safePage = Math.max(1, Math.min(totalPages, p));
    router.push(`/settings/users?q=${encodeURIComponent(search)}&page=${safePage}&pageSize=${pageSize}`);
  }

  /** 切换每页条数 / Change page size */
  function changePageSize(size: number) {
    router.push(`/settings/users?q=${encodeURIComponent(search)}&page=1&pageSize=${size}`);
  }

  /** 删除用户 / Delete user */
  async function handleDelete(user: User) {
    const r = await deleteUser(user.id);
    if (r.ok) {
      flash(true, t("userMgmt.deleted"));
      router.refresh();
    } else {
      flash(false, t(r.error) !== r.error ? t(r.error) : r.error);
    }
  }

  /** 重置密码 / Reset password */
  async function handleResetPassword() {
    if (!resetTarget) return;
    const r = await resetUserPassword(resetTarget.id, newPassword);
    if (r.ok) {
      flash(true, t("userMgmt.passwordReset"));
      setResetTarget(null);
      setNewPassword("");
    } else {
      flash(false, t(r.error) !== r.error ? t(r.error) : r.error);
    }
  }

  /** 角色标签 / Role badge */
  function RoleBadge({ role }: { role: string }) {
    if (role === "admin") {
      return <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">{t("userMgmt.roleAdmin")}</span>;
    }
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{t("userMgmt.roleUser")}</span>;
  }

  /** 状态标签 / Status badge */
  function StatusBadge({ status }: { status: string }) {
    if (status === "active") {
      return <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">{t("userMgmt.statusActive")}</span>;
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
          href="/settings/users/new"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold !text-white hover:bg-teal-700"
        >
          {t("userMgmt.add")}
        </Link>
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("userMgmt.searchPlaceholder")}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">
            {t("common.search")}
          </button>
        </form>
      </div>

      {/* 用户列表 / User list */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">{t("userMgmt.userId")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.nickname")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.email")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.role")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.status")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.createdAt")}</th>
              <th className="px-4 py-3 font-medium">{t("userMgmt.updatedAt")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t("userMgmt.noUsers")}
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
                    {formatDateTime(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {formatDateTime(user.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* 编辑（跳转新页面）/ Edit (navigate to new page) */}
                      <Link
                        href={`/settings/users/${user.id}/edit`}
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
                        <ConfirmButton
                          danger
                          action={() => handleDelete(user)}
                          title={t("userMgmt.deleteTitle")}
                          desc={t("userMgmt.deleteDesc", { name: user.name, email: user.email })}
                          okText={t("common.delete")}
                        >
                          <span className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                            {t("common.delete")}
                          </span>
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 分页控件 / Pagination（与日志管理样式一致） */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {t("userMgmt.pageInfo", { page, totalPages, total })}
              </span>
              {/* 每页条数选择 / Page size selector */}
              <label className="flex items-center gap-1 text-xs text-slate-400">
                {t("userMgmt.perPage")}
                <select
                  value={pageSize}
                  onChange={(e) => changePageSize(parseInt(e.target.value, 10))}
                  className="rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600 outline-none focus:border-teal-500"
                >
                  {allowedPageSizes.map((s) => (
                    <option key={s} value={s}>{t("userMgmt.pageSize", { size: s })}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {t("userMgmt.prevPage")}
              </button>
              {/* 页码按钮（最多显示 5 个） */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${
                      p === page
                        ? "bg-teal-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {t("userMgmt.nextPage")}
              </button>
            </div>
          </div>
        )}
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
