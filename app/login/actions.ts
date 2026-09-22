"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { DASHBOARD_PATH } from "@/lib/constants";

/**
 * 登录动作：交由 Auth.js 校验（含验证码与限流）
 * 成功时框架抛出 redirect，需在 catch 中重抛非 AuthError
 */
export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const captcha = String(formData.get("captcha") ?? "");
  try {
    await signIn("credentials", {
      email,
      password,
      captcha,
      redirectTo: DASHBOARD_PATH,
    });
    return { ok: true, error: null as string | null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "login.error" };
    }
    throw error; // 成功后的 redirect 重抛
  }
}
