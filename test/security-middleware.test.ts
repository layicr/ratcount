/**
 * ratcount · 安全测试：middleware locale cookie 校验
 * 覆盖：合法 cookie 原样透传、非法/缺失 cookie 回写默认 locale、
 *       matcher 跳过静态资源与 api。
 * 说明：middleware 依赖 next/server 的 NextResponse，测试在 node 环境直接
 *       动态 import 真实模块并用最小 request 桩调用，断言 cookie 行为。
 * 运行：npx tsx --test test/security-middleware.test.ts
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

let middleware: (req: any) => any;
let config: { matcher: string[] };

before(async () => {
  const mod = await import("../middleware");
  middleware = mod.default;
  config = mod.config;
});

/** 最小 NextRequest 桩：仅暴露 cookies.get */
function makeReq(value: string | undefined) {
  return {
    cookies: {
      get: (name: string) => (value === undefined ? undefined : { name, value }),
    },
  };
}

/** 读取响应 cookie 中 money_locale 的值，未设置返回 null */
function getSetLocale(res: any): string | null {
  try {
    const c = res?.cookies?.get?.("money_locale");
    return c?.value ?? null;
  } catch {
    return null;
  }
}

test("middleware: 合法 locale cookie 原样透传，不重写 cookie", () => {
  const res = middleware(makeReq("en"));
  assert.strictEqual(getSetLocale(res), null, "合法 locale 不应触发回写");
});

test("middleware: 非法 locale cookie 回写默认 locale（zh-CN）", () => {
  const res = middleware(makeReq("evil"));
  assert.strictEqual(getSetLocale(res), "zh-CN");
});

test("middleware: 缺失 cookie 时回写默认 locale", () => {
  const res = middleware(makeReq(undefined));
  assert.strictEqual(getSetLocale(res), "zh-CN");
});

test("middleware: zh-TW 等合法多语言 cookie 保持原样", () => {
  const res = middleware(makeReq("zh-TW"));
  assert.strictEqual(getSetLocale(res), null);
});

test("middleware: matcher 跳过 api / _next / 静态资源，仅拦截页面路径", () => {
  // Next.js matcher 是锚定到完整路径的表达式，补 ^ $ 后等价于其实际编译结果
  const [re] = config.matcher.map((m) => new RegExp(`^${m}$`));
  assert.ok(!re.test("/api/auth/login"));
  assert.ok(!re.test("/_next/static/chunks/x.js"));
  assert.ok(!re.test("/favicon.ico"));
  assert.ok(re.test("/dashboard"));
  assert.ok(re.test("/transactions"));
  assert.ok(re.test("/settings"));
});
