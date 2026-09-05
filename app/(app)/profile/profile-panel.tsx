"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useT, useLocale } from "@/components/i18n-provider";
import { ConfirmButton } from "../components/confirm";
import { logLogout } from "@/app/actions/auth";
import { updateUserName } from "@/app/actions/profile";

/** 个人设置：风格 / 语言 / 数据管理 + 用户名编辑 + 修改密码入口 */
export function ProfilePanel({ userName, email }: { userName: string; email: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("ratcount_theme") ?? "light";
  });
  const [msg, setMsg] = useState<string | null>(null);
  // 用户名编辑状态 / User name editing state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userName);
  const [savingName, setSavingName] = useState(false);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  }

  /** 保存用户名 / Save user name */
  async function handleSaveName() {
    setSavingName(true);
    const r = await updateUserName(nameInput);
    setSavingName(false);
    if (r.ok) {
      flash(t("profile.nameSaved"));
      setEditingName(false);
      router.refresh(); // 刷新页面数据
    } else {
      flash(t(r.error) !== r.error ? t(r.error) : r.error);
    }
  }

  /** 语言切换：写 cookie ratcount_locale + 整页刷新，服务端按 cookie 渲染全站 */
  function applyLang(v: string) {
    document.cookie = `ratcount_locale=${v}; path=/; max-age=31536000`;
    window.location.reload();
  }

  /** 主题列表（含颜色预览）/ Theme list with color preview */
  const THEMES: Array<[string, string, string]> = [
    ["light", t("profile.light"), "#0d9488"],
    ["dark", t("profile.dark"), "#1e293b"],
    ["ocean", t("profile.themeOcean"), "#2563eb"],
    ["forest", t("profile.themeForest"), "#16a34a"],
    ["sunset", t("profile.themeSunset"), "#ea580c"],
    ["lavender", t("profile.themeLavender"), "#7c3aed"],
    ["rose", t("profile.themeRose"), "#e11d48"],
  ];

  function applyTheme(v: string) {
    localStorage.setItem("ratcount_theme", v);
    setTheme(v);
    // 移除所有主题 class，添加当前主题 / Remove all theme classes, add current
    const el = document.documentElement;
    el.classList.remove("dark", "theme-ocean", "theme-forest", "theme-sunset", "theme-lavender", "theme-rose");
    if (v === "dark") el.classList.add("dark");
    else if (v !== "light") el.classList.add(`theme-${v}`);
    flash(t("profile.themeSaved"));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* 风格设置 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.style")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map(([v, l, color]) => (
            <button
              key={v}
              onClick={() => applyTheme(v)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition ${
                theme === v
                  ? "bg-teal-600 text-white ring-2 ring-teal-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span
                className="h-4 w-4 rounded-full border border-white/50"
                style={{ backgroundColor: color }}
              />
              {l}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{t("profile.themeHint")}</p>
      </div>

      {/* 语言设置 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.language")}</h2>
        <div className="flex gap-2">
          {[["zh", t("i18n.zh")], ["en", t("i18n.en")]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => applyLang(v)}
              className={`flex-1 rounded-lg py-2 text-sm ${locale === v ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{t("profile.langHint")}</p>
      </div>

      {/* 个人信息 / Personal Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.personalInfo")}</h2>
        <div className="space-y-3 text-sm">
          {/* 当前用户信息 / Current user info */}
          <p className="text-[11px] text-slate-400">
            {t("profile.currentUser", { name: userName, email })}
          </p>

          {/* 昵称编辑 / Nickname editing */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">{t("profile.userName")}</span>
              {!editingName && (
                <button
                  type="button"
                  onClick={() => { setNameInput(userName); setEditingName(true); }}
                  className="text-xs text-teal-600 hover:underline"
                >
                  {t("common.edit")}
                </button>
              )}
            </div>
            {editingName ? (
              <div className="space-y-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={30}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <ConfirmButton
                    action={handleSaveName}
                    title={t("profile.saveNameTitle")}
                    desc={t("profile.saveNameDesc", { value: nameInput })}
                    okText={t("common.save")}
                  >
                    <span className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white">
                      {savingName ? t("profile.saving") : t("common.save")}
                    </span>
                  </ConfirmButton>
                  <button
                    type="button"
                    onClick={() => { setNameInput(userName); setEditingName(false); }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-800">{userName || "-"}</p>
            )}
          </div>

          {/* 修改密码按钮 / Change password button */}
          <a
            href="/profile/password"
            className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2 text-center text-sm text-white hover:bg-teal-700 transition"
          >
            <span>🔒</span>
            <span>{t("profile.changePassword")}</span>
          </a>

          {/* 退出按钮 / Logout button */}
          <ConfirmButton
            danger
            action={async () => { await logLogout(); await signOut({ callbackUrl: "/login" }); }}
            title={t("profile.logoutTitle")}
            desc={t("profile.logoutDesc")}
            okText={t("top.logout")}
            className="w-full"
          >
            <span className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 py-2 text-center text-sm font-semibold text-white hover:bg-red-600 transition">
              <span>🚪</span>
              <span>{t("profile.logout")}</span>
            </span>
          </ConfirmButton>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.data")}</h2>
        <div className="space-y-3 text-sm">
          <a href="/api/export" className="block rounded-lg bg-teal-600 py-2 text-center text-white hover:bg-teal-700">
            {t("profile.export")}
          </a>
          <label className="block cursor-pointer rounded-lg border border-slate-200 py-2 text-center text-slate-600 hover:bg-slate-50">
            {t("profile.import")}
            <input type="file" accept=".xlsx" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.append("file", f);
              const r = await fetch("/api/import", { method: "POST", body: fd });
              const j = await r.json().catch(() => ({}));
              flash(j.message ?? t("profile.importDone"));
            }} />
          </label>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">{msg}</p>}
      </div>
    </div>
  );
}
