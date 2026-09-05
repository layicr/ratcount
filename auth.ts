import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
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

/** 写登录失败日志 / Log failed login attempt */
async function logFailedLogin(ip: string, email: string, reason: string) {
  await writeAudit({
    userId: "anonymous",
    action: "U",
    entity: "auth",
    summary: `登录失败：${email}（${reason}）`,
    requestBody: JSON.stringify({ email, reason }),
    responseBody: '{"result":"login-failed"}',
    ip,
  }).catch(() => {});
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
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
        if (!allowAttempt(`login:${ip}`)) {
          await logFailedLogin(ip, attemptEmail, "IP 限流");
          return null;
        }

        // 登录验证码（全局设置 enable_login_captcha 控制）
        if (await getBoolSetting("enable_login_captcha", false)) {
          const capOk = await verifyCaptcha(parsed.data.captcha ?? "");
          if (!capOk) {
            await logFailedLogin(ip, attemptEmail, "验证码错误");
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
          await logFailedLogin(ip, attemptEmail, "用户不存在");
          return null;
        }
        if (user.status !== "active") {
          await logFailedLogin(ip, attemptEmail, "账号已禁用");
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          await logFailedLogin(ip, attemptEmail, "密码错误");
          return null;
        }
        // 登录成功：重置该 IP 的失败计数 + 写审计日志
        resetAttempts(`login:${ip}`);
        await writeAudit({
          userId: user.id,
          action: "C",
          entity: "auth",
          summary: `登录成功：${user.email}`,
          requestBody: JSON.stringify({ email: user.email, name: user.name }),
          responseBody: '{"result":"login-success"}',
          ip,
        }).catch(() => {});
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // 首次签发时注入用户信息 / Inject user info on first sign-in
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      // 会话中携带 id / role，供 scopeGuard 与界面判断使用
      session.user.id = (token.id as string) ?? "";
      session.user.role = (token.role as string) ?? "user";
      return session;
    },
  },
});
// 类型扩展见 types/next-auth.d.ts / Type augmentation lives in types/next-auth.d.ts
