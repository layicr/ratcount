import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/db/schema"
import { AUDIT_ACTION, ENTITY, ROLE, STATUS, LOGIN_PATH, SETTING_KEY, type UserRole } from "@/lib/constants"

import { getBoolSetting } from "@/lib/settings";
import { verifyCaptcha } from "@/lib/auth/captcha";
import { allowAttempt, resetAttempts } from "@/lib/auth/rate-limit";
import { writeAudit } from "@/lib/audit";

/**
 * ratcount · Auth.js v5 配置（Credentials + JWT 会话）
 *  - JWT 策略：适配 Vercel 无持久文件系统
 *  - 凭证校验：邮箱 + 密码（bcrypt）+ 登录验证码（可全局开关）+ IP 限流
 *  - 登录成功/失败均写入审计日志（entity=auth）
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captcha: z.string().optional(),
});

/** 登录失败原因 → i18n 摘要键（位于 messages 的 audit.loginFailed.*） */
const LOGIN_FAIL_REASON = {
  ipLimit: "audit.loginFailed.ipLimit",
  accountLimit: "audit.loginFailed.accountLimit",
  captchaError: "audit.loginFailed.captchaError",
  userNotFound: "audit.loginFailed.userNotFound",
  accountDisabled: "audit.loginFailed.accountDisabled",
  wrongPassword: "audit.loginFailed.wrongPassword",
} as const;

/** 写登录失败日志 / Log failed login attempt */
async function logFailedLogin(ip: string, email: string, reasonKey: string) {
  await writeAudit({
    userId: "anonymous",
    action: AUDIT_ACTION.update,
    entity: ENTITY.auth,
    summaryKey: reasonKey,
    summaryParams: { email },
    requestBody: JSON.stringify({ email, reason: reasonKey }),
    responseBody: '{"result":"login-failed"}',
    ip,
  }).catch(() => {});
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: LOGIN_PATH },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, captcha: {} },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // IP 限流（防爆破） / Rate limit by IP
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const attemptEmail = parsed.data.email.toLowerCase();
        // 双层限流：先按 IP（防单机爆破），再按 email 维度（防针对特定账号跨 IP 爆破）
        if (!allowAttempt(`login:${ip}`)) {
          await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.ipLimit);
          return null;
        }
        if (!allowAttempt(`login:${attemptEmail}`)) {
          await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.accountLimit);
          return null;
        }

        // 登录验证码（全局设置 enable_login_captcha 控制）
        if (await getBoolSetting(SETTING_KEY.enableLoginCaptcha, false)) {
          const capOk = await verifyCaptcha(parsed.data.captcha ?? "");
          if (!capOk) {
            await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.captchaError);
            return null;
          }
        }

        const { email, password } = parsed.data;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        if (!user) {
          await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.userNotFound);
          return null;
        }
        if (user.status !== STATUS.active) {
          await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.accountDisabled);
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          await logFailedLogin(ip, attemptEmail, LOGIN_FAIL_REASON.wrongPassword);
          return null;
        }
        // 登录成功：重置该 IP 与该账号的失败计数 + 写审计日志
        resetAttempts(`login:${ip}`);
        resetAttempts(`login:${attemptEmail}`);
        await writeAudit({
          userId: user.id,
          action: AUDIT_ACTION.create,
          entity: ENTITY.auth,
          summaryKey: "audit.loginSuccess",
          summaryParams: { email: user.email },
          requestBody: JSON.stringify({ email: user.email, name: user.name }),
          responseBody: '{"result":"login-success"}',
          ip,
        }).catch(() => {});
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // 首次签发时注入用户信息 / Inject user info on first sign-in
      if (user) {
        token.id = user.id as string;
        token.role = user.role ?? ROLE.user;
        // 会话版本随用户走：requireUser 会与库中比对，不一致即失效（支持吊销）
        token.tokenVersion = user.tokenVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      // 会话中携带 id / role / tokenVersion，供 scopeGuard 与界面判断使用
      session.user.id = (token.id as string) ?? "";
      session.user.role = (token.role as UserRole | undefined) ?? ROLE.user;
      session.user.tokenVersion = (token.tokenVersion as number | undefined) ?? 0;
      return session;
    },
  },
});
// 类型扩展见 types/next-auth.d.ts / Type augmentation lives in types/next-auth.d.ts
