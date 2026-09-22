"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { loginAction } from "./actions";

/** 登录表单（客户端）：账号 / 密码 / 验证码 + 中英切换 */
export default function LoginForm({
  appName,
  appSlogan,
  captchaEnabled,
  allowRegistration,
}: {
  appName: string;
  appSlogan: string;
  captchaEnabled: boolean;
  allowRegistration: boolean;
}) {
  const [state, formAction, pending] = useActionState(loginAction, {
    ok: false,
    error: null as string | null,
  });
  // 初始用固定占位值，保证 SSR 与客户端首次渲染一致；挂载后再生成真实时间戳，避免水合不匹配
  const [capKey, setCapKey] = useState<number | null>(null);
  useEffect(() => {
    setCapKey(Date.now());
  }, []);
  const t = useTranslations();

  return (
    <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>

      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={appName}
          className="mx-auto mb-3 h-14 w-14 rounded-2xl object-contain"
        />
        <h1 className="text-xl font-bold text-slate-900">{appName}</h1>
        <p className="mt-1 text-xs text-slate-500">{appSlogan || t("login.subtitle")}</p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("common.email")}
          </label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("common.password")}
          </label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {captchaEnabled && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("common.captcha")}
            </label>
            <div className="flex gap-2">
              <input
                name="captcha"
                maxLength={4}
                placeholder={t("login.captchaPlaceholder")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capKey ? `/api/captcha?t=${capKey}` : undefined}
                alt="captcha"
                title={t("login.captchaPlaceholder")}
                onClick={() => setCapKey(Date.now())}
                className="h-[40px] w-[96px] cursor-pointer rounded-lg border border-slate-200"
              />
            </div>
          </div>
        )}

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {t(state.error)}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {pending ? t("login.loggingIn") : t("login.submit")}
        </button>
      </form>

      <div className="mt-5 text-center text-xs text-slate-400">
        {allowRegistration ? (
          <a href="/register" className="text-teal-600 hover:underline">
            {t("login.registerLink")}
          </a>
        ) : (
          t("login.noRegister")
        )}
        <p className="mt-2">{t("login.demo")}</p>
      </div>
    </div>
  );
}
