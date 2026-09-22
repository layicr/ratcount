import { type Metadata } from "next";
import "./globals.css";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getSetting, getAppName } from "@/lib/settings";
import { SETTING_KEY } from "@/lib/constants";
import { db } from "@/lib/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_CODES, normalizeTheme, resolveThemeCode, themeClassName } from "@/i18n/themes";
import { THEME_COOKIE } from "@/lib/constants";

/** 根布局标题 / Root layout title（不含 SEO 元信息）
 * 应用名取自后台「应用名称」设置（DB app_name，管理员可改、支持多语言），缺失时回退环境变量 APP_NAME */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: await getAppName(locale) };
}

/** 根布局：注入 next-intl Provider（服务端读 locale + messages + timeZone）/ Root layout shell */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, timeZone] = await Promise.all([
    getLocale(),
    getMessages(),
    getTimeZone(),
  ]);
  // 全局默认风格：settings.default_theme（缺失或非法回退 light），供未设个人偏好的用户使用
  let defaultTheme = DEFAULT_THEME;
  try {
    defaultTheme = normalizeTheme(await getSetting(SETTING_KEY.defaultTheme));
  } catch {
    // 数据库未就绪（如构建期预渲染）时回退默认风格 / DB not ready, fall back
  }

  // 用户个人风格：user_profiles.theme_code（优先级最高，跨设备跟随）
  // 仅已登录且值为内置主题时注入；非法值视为未设置，落到后续优先级
  let userTheme: string | null = null;
  try {
    const session = await auth();
    const uid = session?.user?.id;
    if (uid) {
      const [row] = await db
        .select({ themeCode: userProfiles.themeCode })
        .from(userProfiles)
        .where(eq(userProfiles.userId, uid))
        .limit(1);
      if (row?.themeCode && THEME_CODES.includes(row.themeCode)) userTheme = row.themeCode;
    }
  } catch {
    // 未登录或数据库未就绪：回退本机偏好 / 全局默认风格 / Not signed in or DB not ready
  }

  // 本机风格偏好：cookie money_theme（由「个人中心 → 风格设置」写入），优先级低于账号偏好、高于全局默认
  let localTheme: string | null = null;
  try {
    const store = await cookies();
    localTheme = store.get(THEME_COOKIE)?.value ?? null;
  } catch {
    // 无请求上下文（构建期等）：忽略本机偏好 / No request context, skip local preference
  }

  // 首屏风格由服务端直接渲染到 <html class>，无需内联脚本（避免 React 对客户端 <script> 的告警与闪烁）
  const theme = resolveThemeCode(userTheme, localTheme, defaultTheme);

  const htmlLang = locale;
  return (
    <html
      lang={htmlLang}
      className={themeClassName(theme)}
      data-user-theme={userTheme ?? undefined}
      data-default-theme={defaultTheme}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
