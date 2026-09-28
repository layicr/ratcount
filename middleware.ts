import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { LOCALE_COOKIE_NAME as COOKIE_NAME } from "@/lib/constants";

const VALID_LOCALES = new Set<string>(routing.locales);
const isProd = process.env.NODE_ENV === "production";

// CSP 基础指令（不含 script-src / style-src，由 buildCsp 按环境追加）
const CSP_BASE = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'self'",
];

/**
 * 生成 Content-Security-Policy。
 *  - 生产：script-src 仅 'self' + 每请求 nonce（无 unsafe-inline），杜绝任意内联脚本执行。
 *  - 开发：保留 'unsafe-inline' 'unsafe-eval' 以支持 HMR / 错误浮层。
 *  - style-src 保留 unsafe-inline：React 内联样式普遍，去内联风险低且会破坏 UI。
 */
function buildCsp(nonce: string): string {
  const script = isProd
    ? `script-src 'self' 'nonce-${nonce}'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const style = "style-src 'self' 'unsafe-inline'";
  return [CSP_BASE[0], script, style, ...CSP_BASE.slice(1)].join("; ");
}

/**
 * ratcount · 自定义 middleware：不做任何路径 rewrite（项目为无 [locale] 目录的
 * cookie 结构，next-intl 的 createMiddleware 会把页面 rewrite 成 /zh/** 导致全站 404）。
 * 职责：① 校验 cookie `money_locale` 是否为合法 locale，非法/缺失时回写默认值；
 * ② 按请求生成 nonce 注入 Content-Security-Policy（P1-2）；路径原样透传。
 */
export default function middleware(req: NextRequest) {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const locale = raw && VALID_LOCALES.has(raw) ? raw : routing.defaultLocale;

  // 每请求随机 nonce，注入 CSP 并透传给应用（供未来内联脚本使用 nonce 属性）
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  res.headers.set("X-Content-Type-Options", "nosniff");

  if (!raw || !VALID_LOCALES.has(raw)) {
    res.cookies.set(COOKIE_NAME, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
      secure: isProd,
      sameSite: "lax", // P2-1：补 SameSite，防 CSRF 跨站携带
    });
  }
  return res;
}

export const config = {
  // 跳过 api、_next 静态资源与带后缀的文件（页面都在无 locale 段路径下）
  matcher: ["/((?!api|_next|_next/static|_vercel|.*\\..*).*)"],
};
