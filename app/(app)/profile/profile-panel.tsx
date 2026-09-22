"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale, useTimeZone } from "next-intl";
import { ConfirmButton } from "../components/confirm";
import { logLogout } from "@/app/actions/auth";
import { updateUserName } from "@/app/actions/profile";
import { updateUserPreferences } from "@/app/actions/user-preferences";
import { COMMON_TIME_ZONES, tzLabel, DEFAULT_TIME_ZONE } from "@/i18n/timezones";
import { TIME_ZONE_COOKIE } from "@/lib/constants";
import { THEME_ITEMS, DEFAULT_THEME, applyThemeToDocument } from "@/i18n/themes";
import { LOGIN_PATH, LOCALE_COOKIE_NAME, THEME_COOKIE } from "@/lib/constants";

/** 个人设置：风格 / 语言 / 数据管理 + 用户名编辑 + 修改密码入口 */
export function ProfilePanel({
  userName,
  email,
  bio,
  localeOptions,
  defaultLocale,
}: {
  userName: string;
  email: string;
  bio: string;
  localeOptions: { code: string; label: string }[];
  defaultLocale?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  // 当前风格：初始用服务端安全值（DEFAULT_THEME）避免 hydration 不匹配；
  // 挂载后读取服务端已应用到 <html> 的 class（账号偏好 → 本机 cookie → 全局默认 已在服务端解析完成）
  const [theme, setTheme] = useState(DEFAULT_THEME);
  useEffect(() => {
    const el = document.documentElement;
    const t = el.classList.contains("dark") ? "dark" : (el.className.match(/theme-([a-z]+)/)?.[1] ?? DEFAULT_THEME);
    if (t !== theme) setTheme(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [msg, setMsg] = useState<string | null>(null);
  // 用户名编辑状态 / User name editing state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userName);
  const [savingName, setSavingName] = useState(false);
  // 个人宣言编辑状态 / Bio editing state
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(bio);
  const [savingBio, setSavingBio] = useState(false);

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
      flash(t(r.error));
    }
  }

  /** 保存个人宣言 / Save bio */
  async function handleSaveBio() {
    setSavingBio(true);
    try {
      await updateUserPreferences({ bio: bioInput });
      flash(t("profile.bioSaved"));
      setEditingBio(false);
      router.refresh(); // 刷新页面数据
    } catch {
      flash(t("errors.saveFailed"));
    } finally {
      setSavingBio(false);
    }
  }

  /** 语言切换：写 cookie + 持久化到 user_profiles + 整页刷新 */
  async function applyLang(v: string) {
    document.cookie = `${LOCALE_COOKIE_NAME}=${v}; path=/; max-age=31536000`;
    try { await updateUserPreferences({ localeCode: v }); } catch { /* 持久化失败不影响界面 */ }
    window.location.reload();
  }

  /** 当前时区（来自 next-intl provider，缺省回退默认） */
  const tz = useTimeZone() ?? DEFAULT_TIME_ZONE;

  /** 时区切换：写 cookie money_timezone + 持久化到 user_profiles + 整页刷新 */
  async function applyTimezone(v: string) {
    document.cookie = `${TIME_ZONE_COOKIE}=${v}; path=/; max-age=31536000`;
    try { await updateUserPreferences({ timezoneCode: v }); } catch { /* 持久化失败不影响界面 */ }
    window.location.reload();
  }

  /** 主题列表来自 i18n/themes.ts（与全局设置「默认风格」同源），显示名取 theme.* */
  async function applyTheme(v: string) {
    // 本机偏好写入 cookie：根布局服务端据此直接渲染 <html class>（刷新后同样生效，不再依赖内联脚本）
    document.cookie = `${THEME_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
    setTheme(v);
    applyThemeToDocument(v); // 清旧 class 并按新主题添加 / Swap theme classes
    try { await updateUserPreferences({ themeCode: v }); } catch { /* 持久化失败不影响界面 */ }
    // 刷新 RSC：同步 <html data-user-theme>，使服务端偏好立即生效（换设备也跟随）
    router.refresh();
    flash(t("profile.themeSaved"));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* 风格设置 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.style")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {THEME_ITEMS.map(({ code: v, color }) => (
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
              {t(`theme.${v}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{t("profile.themeHint")}</p>
      </div>

      {/* 语言设置：选项由「语言配置」(languages 表) 驱动，切换后整页刷新即按新语言显示 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.language")}</h2>
        <div className="flex flex-wrap gap-2">
          {localeOptions.map(({ code: v, label: l }) => (
            <button
              key={v}
              onClick={() => applyLang(v)}
              className={`flex-1 rounded-lg px-2 py-2 text-sm ${locale === v ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {l}
              {defaultLocale === v && (
                <span className="ml-1 text-[10px] opacity-80">·{t("language.default")}</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{t("profile.langHint")}</p>
      </div>

      {/* 时区设置 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-800">{t("profile.timezone")}</h2>
        <select
          value={tz}
          onChange={(e) => applyTimezone(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500"
        >
          {COMMON_TIME_ZONES.map((code) => (
            <option key={code} value={code}>{tzLabel(code, locale)}</option>
          ))}
        </select>
        <p className="mt-3 text-[11px] text-slate-400">{t("profile.timezoneHint")}</p>
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
              <span className="text-xs font-medium text-slate-600">{t("common.nickname")}</span>
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
                {nameInput.trim().length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    {t("common.nameRequired")}
                  </p>
                )}
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

          {/* 个人宣言编辑 / Bio editing */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">{t("profile.bio")}</span>
              {!editingBio && (
                <button
                  type="button"
                  onClick={() => { setBioInput(bio); setEditingBio(true); }}
                  className="text-xs text-teal-600 hover:underline"
                >
                  {t("common.edit")}
                </button>
              )}
            </div>
            {editingBio ? (
              <div className="space-y-2">
                <textarea
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder={t("profile.bioPlaceholder")}
                  className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500"
                />
                <div className="flex gap-2">
                  <ConfirmButton
                    action={handleSaveBio}
                    title={t("profile.saveBioTitle")}
                    desc={t("profile.saveBioDesc")}
                    okText={t("common.save")}
                  >
                    <span className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700">
                      {savingBio ? t("profile.saving") : t("common.save")}
                    </span>
                  </ConfirmButton>
                  <button
                    type="button"
                    onClick={() => { setBioInput(bio); setEditingBio(false); }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-800">{bio || t("profile.bioPlaceholder")}</p>
            )}
          </div>

          {/* 我的菜单入口 / My Menu entry */}
          <Link
            href="/profile/menu"
            className="flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 py-2 text-center text-sm text-teal-700 hover:bg-teal-100 transition"
          >
            <span>📋</span>
            <span>{t("profile.myMenu")}</span>
          </Link>

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
            action={async () => { await logLogout(); await signOut({ callbackUrl: LOGIN_PATH }); }}
            title={t("common.logout")}
            desc={t("profile.logoutDesc")}
            okText={t("common.logout")}
            className="w-full"
          >
            <span className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 py-2 text-center text-sm font-semibold text-white hover:bg-red-600 transition">
              <span>🚪</span>
              <span>{t("common.logout")}</span>
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
          <Link href="/import" className="block rounded-lg border border-slate-200 py-2 text-center text-slate-600 hover:bg-slate-50">
            {t("profile.import")}
          </Link>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">{msg}</p>}
      </div>
    </div>
  );
}
