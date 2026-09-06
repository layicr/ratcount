import { NextResponse } from "next/server";
import { issueCaptcha, renderCaptchaSvg } from "@/lib/auth/captcha";
import { allowAttempt, CAPTCHA_LIMIT } from "@/lib/auth/rate-limit";

/** 验证码接口：返回 SVG + 设置签名 cookie / Captcha endpoint（每 IP 限流防刷） */
export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowAttempt(`captcha:${ip}`, CAPTCHA_LIMIT)) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(CAPTCHA_LIMIT.windowMs / 1000)),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  const code = await issueCaptcha();
  const svg = renderCaptchaSvg(code);
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
