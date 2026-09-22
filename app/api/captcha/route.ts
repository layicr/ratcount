import { NextResponse } from "next/server";
import { issueCaptcha, renderCaptchaPng } from "@/lib/auth/captcha";
import { allowAttempt, CAPTCHA_LIMIT } from "@/lib/auth/rate-limit";

// 位图渲染用到 node:zlib（PNG 编码），固定 Node 运行时
export const runtime = "nodejs";

/** 验证码接口：返回 PNG 位图 + 设置签名 cookie / Captcha endpoint（每 IP 限流防刷） */
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
  // PNG 位图：响应体内只有像素，答案是服务端 cookie 里的摘要比对，无法从图片响应中读取出文本
  const png = renderCaptchaPng(code);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
