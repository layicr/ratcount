import { z } from "zod";

/**
 * 环境变量类型定义与运行时校验 / Environment variables schema
 *  - 启动时校验必填项，缺失时抛出明确错误
 *  - 导出 env 对象，全项目使用，替代直接访问 process.env
 */

const envSchema = z.object({
  // 数据库
  DATABASE_MODE: z.string().default("file"), // file=本地SQLite / libsql=Turso云端
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空"),
  // 认证
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET 至少 16 位（生产环境建议 32 位以上强随机密钥）"),
  // 应用
  NEXT_PUBLIC_APP_NAME: z.string().default("ratcount"),
  // Turso（仅 DATABASE_MODE=turso 时需要）
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  // Node 环境
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Turso 模式下校验必填项
const tursoRequired = envSchema.superRefine((val, ctx) => {
  if (val.DATABASE_MODE === "turso") {
    if (!val.TURSO_DATABASE_URL) {
      ctx.addIssue({ code: "custom", message: "TURSO_DATABASE_URL 在 turso 模式下必填", path: ["TURSO_DATABASE_URL"] });
    }
    if (!val.TURSO_AUTH_TOKEN) {
      ctx.addIssue({ code: "custom", message: "TURSO_AUTH_TOKEN 在 turso 模式下必填", path: ["TURSO_AUTH_TOKEN"] });
    }
  }
});

const parsed = tursoRequired.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  if (process.env.NODE_ENV === "production") {
    // 生产环境严格校验，缺失关键变量直接报错
    console.error(`[env] 环境变量校验失败：\n${issues}`);
    throw new Error("环境变量校验失败，请检查 .env.local");
  } else {
    // 开发/测试环境使用默认值并打印警告，不阻断启动
    console.warn(`[env] 环境变量校验警告（使用默认值）：\n${issues}`);
  }
}

// 开发/测试环境校验失败时，合并默认值
export const env = parsed.success
  ? parsed.data
  : {
      DATABASE_MODE: process.env.DATABASE_MODE ?? "file",
      DATABASE_URL: process.env.DATABASE_URL ?? "file:./data/ratcount.db",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-secret-ratcount-local-2026",
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "ratcount",
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      NODE_ENV: (process.env.NODE_ENV as "development" | "production" | "test") ?? "development",
    };
export type Env = typeof env;
