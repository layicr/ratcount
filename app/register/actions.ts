"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, ledgers, ledgerMembers } from "@/db/schema";
import { getBoolSetting } from "@/lib/settings";
import { allowAttempt, resetAttempts } from "@/lib/auth/rate-limit";
import { verifyCaptcha } from "@/lib/auth/captcha";
import { writeAudit } from "@/lib/audit";
import { registerSchema } from "@/lib/validators";

const BCRYPT_COST = 12; // bcrypt cost（最大 31；cost=50 超出规范不被支持，12 为安全与性能平衡值）

const regSchema = registerSchema;

/** 注册动作：限流 + 验证码 + 校验 + 建号 + 自动创建默认账本（首个注册自动 admin） */
export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = regSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    captcha: formData.get("captcha") ?? undefined, // null 转为 undefined，兼容 z.string().optional()
  });
  if (!parsed.success) return { ok: false, error: "register.invalid" };

  // IP 限流（防爆破注册） / Rate limit by IP
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowAttempt(`register:${ip}`)) return { ok: false, error: "register.rateLimited" };

  // 全局设置：是否开放注册
  const allow = await getBoolSetting("allow_registration", true);
  if (!allow) return { ok: false, error: "register.closed" };

  // 登录验证码（全局设置 enable_login_captcha 控制，注册同样校验）
  if (await getBoolSetting("enable_login_captcha", false)) {
    const capOk = await verifyCaptcha(parsed.data.captcha ?? "");
    if (!capOk) return { ok: false, error: "register.captchaInvalid" };
  }

  const email = parsed.data.email.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return { ok: false, error: "register.emailTaken" };

  // 首个注册用户自动成为 admin
  const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
      role: firstUser ? "user" : "admin",
    })
    .returning();

  // 注册成功：重置该 IP 的失败计数
  resetAttempts(`register:${ip}`);

  // 自动创建默认账本并设 owner
  const [ledger] = await db
    .insert(ledgers)
    .values({ name: "我的账本", createdBy: user.id })
    .returning();
  await db.insert(ledgerMembers).values({
    ledgerId: ledger.id,
    userId: user.id,
    role: "owner",
  });

  // 注册成功写审计日志 / Log successful registration
  await writeAudit({
    userId: user.id,
    action: "C",
    entity: "register",
    summary: `注册成功：${user.email}（${user.name}）`,
    requestBody: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
    responseBody: JSON.stringify({ result: "registered", ledgerId: ledger.id }),
    ip,
  }).catch(() => {});

  redirect("/login");
}
