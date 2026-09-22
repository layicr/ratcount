/**
 * ratcount · env.ts 环境变量校验测试
 *
 * lib/env.ts 是模块级副作用（import 时即 safeParse）。为验证不同 env 分支，
 * 采用「子进程隔离」方式：每个分支都在独立 tsx 进程中加载 lib/env.ts，
 * 断言默认值 / 数值 coercion / 生产模式缺关键变量抛错。
 *
 * 运行：npx tsx --test test/unit-env.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const TSX = "npx --no-install tsx";

/** 在独立子进程中加载 lib/env.ts，返回 {stdout,stderr,status} */
function loadEnvInChild(extraEnv: Record<string, string | undefined>): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const code = [
    "import('./lib/env.ts').then(m => {",
    "  const e = m.env;",
    "  console.log('OK ' + [e.DATABASE_MODE, e.DB_CONCURRENCY, typeof e.AUTH_SECRET, e.AUTH_SECRET ? e.AUTH_SECRET.length : 0, e.NODE_ENV].join('|'));",
    "}).catch(err => { console.error('LOAD_FAIL ' + err.message); process.exit(7); });",
  ].join("");
  const result = {
    stdout: "",
    stderr: "",
    status: 0,
  };
  try {
    result.stdout = execSync(`${TSX} -e "${code}"`, {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv, NODE_ENV: extraEnv.NODE_ENV as NodeJS.ProcessEnv["NODE_ENV"] },
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (err: any) {
    result.status = err.status ?? -1;
    result.stderr = err.stderr ? String(err.stderr) : "";
    result.stdout = err.stdout ? String(err.stdout) : "";
  }
  return result;
}

test("env: 未配置数值项时使用默认值（DB_CONCURRENCY=20, DATABASE_MODE=file）", () => {
  const r = loadEnvInChild({
    NODE_ENV: "test",
    DATABASE_URL: "file:./data/test.db",
    AUTH_SECRET: "0123456789abcdef",
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK file\|20\|string\|16\|test/, r.stdout);
});

test("env: 数值项字符串可自动 coercion（DB_CONCURRENCY=30 → 30）", () => {
  const r = loadEnvInChild({
    NODE_ENV: "development",
    DATABASE_URL: "file:./data/test.db",
    AUTH_SECRET: "0123456789abcdef",
    DB_CONCURRENCY: "30",
    DB_STATEMENT_TIMEOUT_MS: "9999",
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK file\|30\|/, r.stdout);
});

test("env: development 缺关键变量不阻断，AUTH_SECRET 回退开发默认值", () => {
  // 仅提供 DATABASE_URL，缺 AUTH_SECRET —— 开发模式给出警告并使用默认密钥
  const r = loadEnvInChild({
    NODE_ENV: "development",
    DATABASE_URL: "file:./data/ratcount.db",
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK file\|\d+\|string\|/, r.stdout);
});

test("env: production 缺 AUTH_SECRET 直接抛错（启动阻断）", () => {
  const r = loadEnvInChild({
    NODE_ENV: "production",
    DATABASE_URL: "file:./data/ratcount.db",
  });
  assert.strictEqual(r.status, 7, "生产模式缺失关键变量应加载失败");
  assert.match(r.stderr, /环境变量校验失败/, r.stderr);
});
