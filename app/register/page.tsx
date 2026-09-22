import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/scope";
import { getBoolSetting } from "@/lib/settings";
import { RegisterForm } from "./register-form";
import { DASHBOARD_PATH, SETTING_KEY } from "@/lib/constants";

/** 注册页：服务端读取全局设置（验证码开关）后渲染表单 */
export default async function RegisterPage() {
  // 同登录页：仅「仍然有效」的会话才跳仪表盘，避免旧 cookie 造成重定向死循环
  // Same as login: only a still-valid session redirects, avoiding a redirect loop from a stale cookie.
  const user = await getSessionUser();
  if (user) redirect(DASHBOARD_PATH);

  // 注册验证码与登录共用同一全局开关 enable_login_captcha
  const captchaEnabled = await getBoolSetting(SETTING_KEY.enableLoginCaptcha, false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-indigo-50 p-4">
      <RegisterForm captchaEnabled={captchaEnabled} />
    </main>
  );
}
