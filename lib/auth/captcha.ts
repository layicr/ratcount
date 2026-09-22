import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { deflateSync } from "node:zlib";
import { env } from "@/lib/env";
import { CAPTCHA_COOKIE } from "@/lib/constants";

/**
 * 自研轻量图形验证码（零外部依赖，含位图渲染）
 *  - 4 位字符，排除易混淆的 0/O/1/I
 *  - 答案摘要（SHA-256，加盐）存入签名 JWT 的 httpOnly cookie，5 分钟有效
 *    （JWS 只签名不加密：绝不把答案明文放进 payload，避免解码 cookie 即得答案）
 *  - 校验单向、常量时间比较；一次性（防重放）：校验通过即销毁 cookie
 *  - 纯函数（generateCaptchaCode / createCaptchaToken / verifyCaptchaToken）
 *    与 cookie 封装（issueCaptcha / verifyCaptcha）分离，便于单元测试
 *  - 图形渲染为 PNG 位图（本文件下半部分，renderCaptchaPng）：
 *    响应体里只有像素，不含任何答案文本。字模与本文件的 CHARS 严格对应。
 * Self-built lightweight image captcha (zero external deps, bitmap rendering included)
 *  - 4 chars, excluding ambiguous 0/O/1/I
 *  - The answer digest (SHA-256, salted) is stored in a signed httpOnly JWT cookie, valid 5 min
 *    (JWS signs but does not encrypt: never put the answer plaintext in the payload)
 *  - Verification is one-way with constant-time comparison; single-use (anti-replay)
 *  - Pure functions (generateCaptchaCode / createCaptchaToken / verifyCaptchaToken)
 *    are separated from the cookie wrappers (issueCaptcha / verifyCaptcha) for easy unit testing
 *  - Rendering is a PNG bitmap (lower half of this file, renderCaptchaPng):
 *    the response body holds only pixels, no answer text. Glyphs strictly match CHARS here.
 */
export const CAPTCHA_SECRET = new TextEncoder().encode(`${env.AUTH_SECRET}:captcha-v1`);

/** 答案摘要：只把摘要写进 token（含 AUTH_SECRET 加盐，防彩虹表）/ Answer digest: only the digest goes into the token (salted with AUTH_SECRET, rainbow-table safe) */
async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(`${code.trim().toUpperCase()}:${env.AUTH_SECRET}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 常量时间字符串比较（避免按字符提前返回泄露信息）/ Constant-time string compare (avoid early-return leaks) */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const TTL_SECONDS = 300;

/**
 * 纯函数：生成 4 位验证码（仅含不易混淆字符）
 * 用 crypto.getRandomValues 取加密安全随机数；CHARS 长度为 32，256 % 32 === 0，
 * 故按字节取模无偏差（modulo bias），无需拒绝采样。
 * Pure function: generate a 4-char captcha (only unambiguous chars)
 * Uses crypto.getRandomValues for CSPRNG bytes; CHARS length is 32 and 256 % 32 === 0,
 * so modulo-by-byte is unbiased (no modulo bias) and no rejection sampling is needed.
 */
export function generateCaptchaCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARS[bytes[i] % CHARS.length];
  }
  return code;
}

/** 纯函数：将「答案摘要」签名成 JWT token（payload 不含答案明文）/ Pure function: sign the answer digest into a JWT token (payload holds no answer plaintext) */
export async function createCaptchaToken(code: string): Promise<string> {
  return new SignJWT({ h: await hashCode(code) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(CAPTCHA_SECRET);
}

/** 纯函数：校验 token 与明文是否匹配（不消费 cookie，供 verifyCaptcha 与单测使用）/ Pure function: check token vs plaintext (does not consume the cookie; used by verifyCaptcha and tests) */
export async function verifyCaptchaToken(token: string, input: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, CAPTCHA_SECRET);
    if (typeof payload.h !== "string") return false; // 旧格式（明文 code）一律拒绝 / legacy format (plaintext code) is always rejected
    return timingSafeEqualStr(payload.h, await hashCode(input));
  } catch {
    return false;
  }
}

/** 签发验证码：写入签名 cookie 并返回明文（用于绘制位图）/ Issue a captcha: write the signed cookie and return the plaintext (used to render the image) */
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

/** 校验验证码：正确则消费（防重放）/ Verify & consume the captcha (anti-replay) */
export async function verifyCaptcha(input: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(CAPTCHA_COOKIE)?.value;
  if (!token) return false;
  store.set(CAPTCHA_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return verifyCaptchaToken(token, input);
}

/* ====================================================================
 * 位图渲染（零依赖：5×7 点阵字模 + 手写 PNG 编码）
 *  - 为什么不用 SVG：SVG 里字符以 <text> 输出，脚本直接解析 DOM/正则即可拿到答案。
 *  - 位图（PNG）只含像素，答案不再以任何文本形式出现在响应体中。
 *  - 实现要点：
 *     字模：与本文件上半部分的 CHARS 严格对应（无 0/O/1/I 等易混淆字符）
 *     绘制：逐字随机抖动 + 轻微倾斜（shear）+ 干扰点/干扰线（先画干扰、字在上层，保证可读）
 *     编码：PNG 灰度 8bit，IDAT 用 node:zlib deflateSync（Node 运行时；route 已固定 runtime = nodejs）
 * Bitmap renderer (zero-dependency: 5×7 dot-matrix glyphs + hand-rolled PNG encoder)
 *  - Why not SVG: SVG emits characters as <text>, so a script can parse the DOM/regex to read the answer.
 *  - A bitmap (PNG) contains only pixels; the answer never appears as text in the response body.
 *  - Highlights:
 *     glyphs: strictly match CHARS above (no ambiguous 0/O/1/I)
 *     drawing: per-glyph random jitter + slight shear + noise dots/lines (noise first, glyphs on top)
 *     encoding: 8-bit grayscale PNG, IDAT via node:zlib deflateSync (route pins runtime = nodejs)
 * ==================================================================== */

/** 画布尺寸（与前端 <img> 的 96×40 样式一致，避免拉伸变形）/ Canvas size (matches the 96×40 front-end <img> to avoid stretching) */
export const CAPTCHA_WIDTH = 96;
export const CAPTCHA_HEIGHT = 40;

/** 5×7 点阵字模：'#' 前景 / '.' 背景；行自上而下，每行 5 列 / 5×7 dot-matrix glyphs: '#' = foreground, '.' = background; top-to-bottom rows, 5 columns each */
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
};

/** 未定义字模时的兜底（实心方块，保证不静默丢字）/ Fallback glyph for undefined chars (solid block, so nothing is silently dropped) */
const FALLBACK_GLYPH = ["#####", "#####", "#####", "#####", "#####", "#####", "#####"];

// ==================== 像素画布 / Pixel canvas ====================

class Canvas {
  readonly pixels: Uint8Array;
  constructor(readonly width: number, readonly height: number, bg = 255) {
    this.pixels = new Uint8Array(width * height).fill(bg);
  }
  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = v;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 255;
    return this.pixels[y * this.width + x];
  }
  line(x0: number, y0: number, x1: number, y1: number, v: number): void {
    // Bresenham 直线算法 / Bresenham line algorithm
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
}

/** [0,1) 随机数（可注入 rng 便于测试确定性）/ Random in [0,1) (inject rng for deterministic tests) */
type Rng = () => number;

/**
 * 把验证码渲染成灰度位图（PNG 像素）
 *  - 先画干扰点/线（浅灰），再画字符（深色）→ 保证人眼可读、机器难以切分
 * Render the captcha into a grayscale bitmap (PNG pixels)
 *  - Draw noise dots/lines (light gray) first, then glyphs (dark) → keeps it human-readable but hard for machines to segment
 */
export function renderCaptchaBitmap(code: string, rng: Rng = Math.random): Canvas {
  const canvas = new Canvas(CAPTCHA_WIDTH, CAPTCHA_HEIGHT, 255);
  const chars = code.split("");
  const gap = 22; // 每字水平步进（5×4=20 宽 + 2 间隙）/ Horizontal step per glyph (5×4=20 wide + 2 gap)
  const startX = 6;
  const scale = 4; // 5×7 → 20×28 / 5×7 glyph scaled to 20×28

  // 1) 干扰：80 个浅灰噪点 / Noise: 80 light-gray dots
  for (let i = 0; i < 80; i++) {
    const v = 150 + Math.floor(rng() * 80);
    canvas.set(Math.floor(rng() * CAPTCHA_WIDTH), Math.floor(rng() * CAPTCHA_HEIGHT), v);
  }
  // 2) 干扰：3 条浅灰斜线 / Noise: 3 light-gray diagonal lines
  for (let i = 0; i < 3; i++) {
    const v = 140 + Math.floor(rng() * 70);
    canvas.line(
      Math.floor(rng() * 20), Math.floor(rng() * CAPTCHA_HEIGHT),
      60 + Math.floor(rng() * (CAPTCHA_WIDTH - 60)), Math.floor(rng() * CAPTCHA_HEIGHT),
      v,
    );
  }

  // 3) 字符：逐字随机抖动 + 轻微倾斜 / Glyphs: per-glyph random jitter + slight shear
  chars.forEach((ch, i) => {
    const glyph = GLYPHS[ch] ?? FALLBACK_GLYPH;
    const jitterX = Math.floor(rng() * 5) - 2; // 水平抖动 −2..2 / horizontal jitter −2..2
    const jitterY = Math.floor(rng() * 7) - 3; // 垂直抖动 −3..3 / vertical jitter −3..3
    const shear = rng() * 0.6 - 0.3; // 每行水平偏移（倾斜感）/ per-row horizontal offset (shear)
    const x0 = startX + i * gap + jitterX;
    const y0 = 6 + jitterY;
    for (let ry = 0; ry < 7; ry++) {
      const shift = Math.round(ry * shear);
      for (let rx = 0; rx < 5; rx++) {
        if (glyph[ry][rx] !== "#") continue;
        // 每个字模像素放大成 scale×scale / Upscale each glyph pixel to scale×scale
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            canvas.set(x0 + rx * scale + px + shift, y0 + ry * scale + py, 40);
          }
        }
      }
    }
  });

  return canvas;
}

// ==================== 最小 PNG 编码（灰度 8bit）/ Minimal PNG encoder (8-bit grayscale) ====================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 灰度位图 → PNG Buffer（bitDepth 8 / colorType 0）/ Grayscale bitmap → PNG Buffer (bitDepth 8 / colorType 0) */
export function encodePngGrayscale(canvas: Canvas): Buffer {
  const { width, height, pixels } = canvas;
  // 每行前置 1 字节 filter（0 = None）/ 1 filter byte per row (0 = None)
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth / 位深
  ihdr[9] = 0; // color type: grayscale / 颜色类型：灰度
  ihdr[10] = 0; // compression / 压缩
  ihdr[11] = 0; // filter / 过滤
  ihdr[12] = 0; // interlace / 隔行
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG 签名 / PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** 验证码 → PNG 位图（对外唯一入口）/ Captcha → PNG bitmap (the only public entry point) */
export function renderCaptchaPng(code: string, rng: Rng = Math.random): Buffer {
  return encodePngGrayscale(renderCaptchaBitmap(code, rng));
}

/** 调试/测试用：把位图转成 ASCII（'#' 深色 / ' ' 浅色），便于人工确认字模可读 / Debug/test helper: bitmap → ASCII ('#' dark / ' ' light) for eyeballing glyph readability */
export function bitmapToAscii(canvas: Canvas, threshold = 140): string {
  const lines: string[] = [];
  for (let y = 0; y < canvas.height; y++) {
    let line = "";
    for (let x = 0; x < canvas.width; x++) line += canvas.get(x, y) < threshold ? "#" : " ";
    lines.push(line);
  }
  return lines.join("\n");
}
