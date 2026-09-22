"use client";

import { useActionState, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { registerAction } from "./actions";
import { LOGIN_PATH } from "@/lib/constants";

/** 注册表单（客户端）：昵称 / 邮箱 / 密码 / 验证码 + 中英切换 */
export function RegisterForm({ captchaEnabled }: { captchaEnabled: boolean }) {
  const [state, formAction, pending] = useActionState(registerAction, {
    ok: false,
    error: null as string | null,
  });
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
        <h1 className="text-xl font-bold text-slate-900">{t("register.title")}</h1>
        <p className="mt-1 text-xs text-slate-500">{t("register.subtitle")}</p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("common.nickname")}
          </label>
          <input
            name="name"
            maxLength={30}
            placeholder={t("common.nickname")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
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
            autoComplete="new-password"
            minLength={6}
            placeholder={t("register.passwordHint")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* 验证码（全局设置控制，与登录共用同一开关） */}
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
          {pending ? t("register.registering") : t("register.submit")}
        </button>
      </form>

      <div className="mt-5 text-center text-xs text-slate-400">
        {t("register.hasAccount")}{" "}
        <a href={LOGIN_PATH} className="text-teal-600 hover:underline">
          {t("register.goLogin")}
        </a>
      </div>
    </div>
  );
}
