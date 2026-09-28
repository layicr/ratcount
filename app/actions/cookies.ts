"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/constants";

const isProd = process.env.NODE_ENV === "production";

/**
 * 服务端设置主题偏好 cookie。
 *  - HttpOnly + Secure(生产) + SameSite=Lax：避免被 XSS 读取/篡改，且不再依赖客户端 document.cookie 写入。
 *  - 根布局服务端据此直接渲染 <html class>，因此客户端无需读取该 cookie（应用主题由服务端完成）。
 * Server-set theme preference cookie (HttpOnly + Secure in prod + SameSite=Lax),
 * immune to XSS read/tamper; server reads it to render <html class>, so the client never needs it.
 */
export async function setThemeCookie(theme: string): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
