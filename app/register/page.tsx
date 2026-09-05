import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBoolSetting } from "@/lib/settings";
import { RegisterForm } from "./register-form";

/** 注册页：服务端读取全局设置（验证码开关）后渲染表单 */
export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // 注册验证码与登录共用同一全局开关 enable_login_captcha
  const captchaEnabled = await getBoolSetting("enable_login_captcha", false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-indigo-50 p-4">
      <RegisterForm captchaEnabled={captchaEnabled} />
    </main>
  );
}
