import { z } from "zod";
import { nodeEnvs, NODE_ENV, type NodeEnv } from "@/lib/constants";

/**
 * 环境变量类型定义与运行时校验 / Environment variable schema & runtime validation
 *  - 启动时校验必填项，缺失时抛出明确错误 / Validate required vars at startup and fail loudly
 *  - 导出 env 对象，全项目使用，替代直接访问 process.env / Export the typed `env` object; prefer it over reading process.env directly
 */

/**
 * 由 DATABASE_URL 推断数据库模式（双部署唯一开关）/ Resolve the DB mode from DATABASE_URL (single switch for dual deployment)
 *  - 以 file: 开头 → 本地 SQLite；其余（libsql:// / https://）→ Turso 云端 / `file:` prefix → local SQLite; anything else (libsql:// / https://) → Turso cloud
 */
export function resolveDbMode(url: string): "file" | "libsql" {
  // trim + 小写：容忍 " FILE:./data/x.db" 这类写法，避免误判为云端 / trim + lowercase: tolerate values like " FILE:./data/x.db" instead of mistaking them for cloud
  return url.trim().toLowerCase().startsWith("file:") ? "file" : "libsql";
}

/**
 * 数值型环境变量 schema：空白字符串按「未设置」处理，避免 Number("")=0 绕过 .default()。
 * 反例：DB_STATEMENT_TIMEOUT_MS=（空）→ 0 → setTimeout(...,0) 令所有语句瞬间「超时」。
 * Numeric env schema: treat blank strings as unset so Number("")=0 can't bypass .default().
 */
const numericEnv = (def: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().default(def));

/** 读取数值环境变量：未设/空白/非有限值时回退默认值（兜底分支用）/ Read numeric env, falling back on unset/blank/non-finite */
const numOr = (raw: string | undefined, def: number): number => {
  const n = raw === undefined || raw.trim() === "" ? def : Number(raw);
  return Number.isFinite(n) ? n : def;
};

const envSchema = z.object({
  // 数据库：DATABASE_URL 以 file: 开头即本地 SQLite，否则为 Turso 云端（见 resolveDbMode）/ Database: `file:` prefix → local SQLite, otherwise Turso cloud (see resolveDbMode)
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL 不能为空"),
  // 应用默认名（仅作兜底；运行时优先使用 settings 表 app_name）/ App default name (fallback only; settings.app_name wins at runtime)
  APP_NAME: z.string().default("ratcount"),
  // 数据库健壮性配置（可用环境变量覆盖，均有默认值）/ DB robustness knobs (overridable via env vars, all have defaults)
  DB_CONCURRENCY: numericEnv(20), // 驱动层并发上限（最接近“连接池”的杠杆）/ Driver-level concurrency cap (closest thing to a connection pool)
  DB_STATEMENT_TIMEOUT_MS: numericEnv(5_000), // 单条语句软超时（毫秒；≤0 关闭）/ Per-statement soft timeout (ms; ≤0 disables)
  DB_MAX_RETRIES: numericEnv(3), // 瞬时错误最大重试次数 / Max retries for transient errors
  DB_RETRY_BASE_DELAY_MS: numericEnv(200), // 重试基础退避（毫秒，指数增长）/ Retry base backoff (ms, exponential)
  // 认证 / Auth
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET 至少 16 位（生产环境建议 32 位以上强随机密钥）"),
  // Turso 云端令牌（云端模式必填，见 superRefine；库地址直接用 DATABASE_URL）/ Turso cloud auth token (required in cloud mode, see superRefine; the DB address itself is DATABASE_URL)
  TURSO_AUTH_TOKEN: z.string().optional(),
  // Node 环境 / Node environment
  NODE_ENV: z.enum(nodeEnvs).default(NODE_ENV.production),
});

// 云端模式（DATABASE_URL 非 file:）下校验 TURSO 令牌必填 / In cloud mode (DATABASE_URL without `file:`) the Turso token becomes mandatory
const tursoRequired = envSchema.superRefine((val, ctx) => {
  if (resolveDbMode(val.DATABASE_URL) === "libsql" && !val.TURSO_AUTH_TOKEN) {
    ctx.addIssue({ code: "custom", message: "TURSO_AUTH_TOKEN 在云端模式下必填", path: ["TURSO_AUTH_TOKEN"] });
  }
});

const parsed = tursoRequired.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  if (process.env.NODE_ENV === NODE_ENV.production) {
    // 生产环境严格校验，缺失关键变量直接报错 / Production: strict — abort startup when a required variable is missing
    console.error(`[env] 环境变量校验失败：\n${issues}`);
    throw new Error("环境变量校验失败，请检查 .env.local");
  } else {
    // 开发/测试环境使用默认值并打印警告，不阻断启动 / Dev/test: fall back to defaults and warn, never block startup
    console.warn(`[env] 环境变量校验警告（使用默认值）：\n${issues}`);
  }
}

// 开发/测试环境校验失败时，合并默认值 / Merge defaults when validation failed in dev/test.
// DATABASE_MODE 不再取自环境变量，统一由 DATABASE_URL 派生（见 resolveDbMode）/ DATABASE_MODE is no longer an env var — derived from DATABASE_URL (see resolveDbMode).
const fallbackUrl = (process.env.DATABASE_URL ?? "file:./data/ratcount.db").trim();

/**
 * 非生产环境的兜底 AUTH_SECRET：进程级随机 256 位
 *  - 绝不回退到固定字面量（公开常量可被用于自签会话 JWT，伪造任意用户含 admin）
 *  - 每次进程重启都会变化 → 开发环境旧会话自动失效（可接受）
 * Dev/test fallback AUTH_SECRET: process-scoped random 256-bit
 *  - Never fall back to a fixed literal (a public constant could be used to self-sign session JWTs and impersonate any user, including admin)
 *  - Changes on every restart → stale dev sessions auto-expire (acceptable)
 */
function ephemeralAuthSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const fallbackAuthSecret = process.env.AUTH_SECRET ?? ephemeralAuthSecret();
if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== NODE_ENV.production) {
  console.warn(
    "[env] 未设置 AUTH_SECRET：已生成本进程的随机密钥（重启后会话失效）。生产环境必须配置强随机 AUTH_SECRET。",
  );
}

export const env = parsed.success
  ? { ...parsed.data, DATABASE_MODE: resolveDbMode(parsed.data.DATABASE_URL) }
  : {
      DATABASE_URL: fallbackUrl,
      DATABASE_MODE: resolveDbMode(fallbackUrl),
      APP_NAME: process.env.APP_NAME ?? "ratcount",
      DB_CONCURRENCY: numOr(process.env.DB_CONCURRENCY, 20),
      DB_STATEMENT_TIMEOUT_MS: numOr(process.env.DB_STATEMENT_TIMEOUT_MS, 5_000),
      DB_MAX_RETRIES: numOr(process.env.DB_MAX_RETRIES, 3),
      DB_RETRY_BASE_DELAY_MS: numOr(process.env.DB_RETRY_BASE_DELAY_MS, 200),
      AUTH_SECRET: fallbackAuthSecret,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      NODE_ENV: (process.env.NODE_ENV as NodeEnv) ?? NODE_ENV.production,
    };
export type Env = typeof env;
