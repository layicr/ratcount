import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * 自研轻量图形验证码（零外部依赖）
 *  - 4 位字符，排除易混淆的 0/O/1/I
 *  - 答案以签名 JWT 存入 httpOnly cookie，5 分钟有效
 *  - 校验一次性（防重放）：校验通过即销毁 cookie
 *  - 纯函数（generateCaptchaCode / createCaptchaToken / verifyCaptchaToken）
 *    与 cookie 封装（issueCaptcha / verifyCaptcha）分离，便于单元测试
 */
const CAPTCHA_COOKIE = "ratcount_captcha";
export const CAPTCHA_SECRET = new TextEncoder().encode(env.AUTH_SECRET);
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const TTL_SECONDS = 300;

/** 纯函数：生成 4 位验证码（仅含不易混淆字符） */
export function generateCaptchaCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/** 纯函数：将明文验证码签名成 JWT token */
export async function createCaptchaToken(code: string): Promise<string> {
  return new SignJWT({ code })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(CAPTCHA_SECRET);
}

/** 纯函数：校验 token 与明文是否匹配（不消费 cookie，供 verifyCaptcha 与单测使用） */
export async function verifyCaptchaToken(token: string, input: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, CAPTCHA_SECRET);
    return payload.code === input.trim().toUpperCase();
  } catch {
    return false;
  }
}

/** 签发验证码：写入签名 cookie 并返回明文（用于绘制 SVG） */
export async function issueCaptcha(): Promise<string> {
  const code = generateCaptchaCode();
  const token = await createCaptchaToken(code);
  const store = await cookies();
  store.set(CAPTCHA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return code;
}

/** 校验验证码：正确则消费（防重放）/ Verify & consume captcha */
export async function verifyCaptcha(input: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(CAPTCHA_COOKIE)?.value;
  if (!token) return false;
  store.set(CAPTCHA_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return verifyCaptchaToken(token, input);
}

/** 生成验证码 SVG（点击可刷新）/ Render captcha SVG */
export function renderCaptchaSvg(code: string): string {
  const chars = code.split("");
  let lines = "";
  for (let i = 0; i < 3; i++) {
    const x1 = Math.floor(Math.random() * 40);
    const y1 = Math.floor(Math.random() * 40);
    const x2 = 40 + Math.floor(Math.random() * 56);
    const y2 = Math.floor(Math.random() * 40);
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8cc8bc" stroke-width="1" opacity="0.6"/>`;
  }
  const texts = chars
    .map((ch, i) => {
      const x = 12 + i * 21;
      const y = 26 + Math.floor(Math.random() * 6 - 3);
      const rot = Math.floor(Math.random() * 24 - 12);
      return `<text x="${x}" y="${y}" font-size="20" font-weight="700" fill="#0d9488" transform="rotate(${rot} ${x} ${y})" text-anchor="middle">${ch}</text>`;
    })
    .join("");
  return `<svg width="96" height="40" viewBox="0 0 96 40" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="40" fill="transparent"/>${lines}${texts}</svg>`;
}
