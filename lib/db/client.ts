// ratcount · 数据库客户端（本地 SQLite / Turso 云端 双部署）
// 双部署核心：仅切换 DATABASE_MODE 一个环境变量
import { createClient, type Client } from "@libsql/client";
import { env } from "@/lib/env";

/** 数据库模式 */
export type DbMode = "file" | "libsql";

const mode = env.DATABASE_MODE as DbMode;
const url = env.DATABASE_URL;

/** libSQL 客户端
 *  - file 模式：本地 SQLite 文件，零配置
 *  - libsql 模式：Turso 云端，需 TURSO_AUTH_TOKEN
 */
export const sqlite: Client =
  mode === "libsql"
    ? createClient({ url, authToken: env.TURSO_AUTH_TOKEN })
    : createClient({ url });
