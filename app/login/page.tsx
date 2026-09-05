import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSetting, getBoolSetting } from "@/lib/settings";
import { getLocale } from "@/lib/i18n";
import LoginForm from "./login-form";

/** 登录页：服务端读取全局设置后渲染表单 */
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const locale = await getLocale();
  // 根据当前语言选择应用名称 / Select app name based on current locale
  const appNameZh = (await getSetting("app_name_zh")) ?? "ratcount";
  const appNameEn = (await getSetting("app_name_en")) ?? "ratcount";
  const appName = locale === "zh" ? (appNameZh || "ratcount") : (appNameEn || "ratcount");
  // 根据当前语言选择应用宣言 / Select app slogan based on current locale
  const appSloganZh = (await getSetting("app_slogan_zh")) ?? "";
  const appSloganEn = (await getSetting("app_slogan_en")) ?? "";
  const appSlogan = locale === "zh" ? appSloganZh : appSloganEn;
  const captchaEnabled = await getBoolSetting("enable_login_captcha", false);
  const allowRegistration = await getBoolSetting("allow_registration", true);

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
