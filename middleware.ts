import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { LOCALE_COOKIE_NAME as COOKIE_NAME } from "@/lib/constants";

const VALID_LOCALES = new Set<string>(routing.locales);

/**
 * ratcount · 自定义 middleware：不做任何路径 rewrite（项目为无 [locale] 目录的
 * cookie 结构，next-intl 的 createMiddleware 会把页面 rewrite 成 /zh/** 导致全站 404）。
 * 职责：校验 cookie `money_locale` 是否为合法 locale，非法/缺失时回写默认值，
 * 保证语言稳定；路径原样透传（NextResponse.next()）。
 */
export default function middleware(req: NextRequest) {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const locale = raw && VALID_LOCALES.has(raw) ? raw : routing.defaultLocale;

  const res = NextResponse.next();
  if (!raw || !VALID_LOCALES.has(raw)) {
    res.cookies.set(COOKIE_NAME, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
    });
  }
  return res;
}

export const config = {
  // 跳过 api、_next 静态资源与带后缀的文件（页面都在无 locale 段路径下）
  matcher: ["/((?!api|_next|_next/static|_vercel|.*\\..*).*)"],
};
