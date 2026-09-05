import { NextResponse } from "next/server";
import { issueCaptcha, renderCaptchaSvg } from "@/lib/auth/captcha";

/** 验证码接口：返回 SVG + 设置签名 cookie / Captcha endpoint */
export async function GET() {
  const code = await issueCaptcha();
  const svg = renderCaptchaSvg(code);
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
