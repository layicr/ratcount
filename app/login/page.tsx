import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/scope";
import { getAppName, getAppSlogan, getBoolSetting } from "@/lib/settings";
import LoginForm from "./login-form";
import { DASHBOARD_PATH, SETTING_KEY } from "@/lib/constants";
import { getLocale } from "next-intl/server";

/** 登录页：服务端读取全局设置后渲染表单 */
export default async function LoginPage() {
  // 仅当会话「仍然有效」（库中存在 + 启用 + tokenVersion 一致）才跳仪表盘；
  // 旧 cookie（如重播种子/改密后）判定为无效，留在登录页，避免 /dashboard ⇄ /login 死循环。
  // Only redirect when the session is still valid; a stale cookie stays on the login page, breaking the loop.
  const user = await getSessionUser();
  if (user) redirect(DASHBOARD_PATH);

  const locale = await getLocale();
  // 应用名加载顺序：DB app_name（管理员可改）→ 静态兜底 "ratcount"（见 getAppName）
  // App name loading: DB override → static default (resilient to missing DB)
  const appName = await getAppName(locale);
  const appSlogan = await getAppSlogan(locale);
  const captchaEnabled = await getBoolSetting(SETTING_KEY.enableLoginCaptcha, false);
  // 注册默认关闭（与 registerAction 口径一致）：需管理员在设置中显式开启
  const allowRegistration = await getBoolSetting(SETTING_KEY.allowRegistration, false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-indigo-50 p-4">
      <LoginForm
        appName={appName}
        appSlogan={appSlogan}
        captchaEnabled={captchaEnabled}
        allowRegistration={allowRegistration}
      />
    </main>
  );
}
