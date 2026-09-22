// ratcount · 桌面建表引导（无迁移文件，运行时幂等建表）/ Desktop schema bootstrap (no migration files; idempotent CREATE TABLE at runtime)
//  - 由 db/schema.ts 自省生成 DDL（21 张表 + 索引），主进程启动时执行一次；
//  - 每张表 IF NOT EXISTS，重复启动安全；升级 schema 时扩展 db/schema.ts 后重启即自动补齐新表/列。
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

type TableLike = Parameters<typeof getTableConfig>[0];

// 筛出全部 sqliteTable 定义（排除聚合导出对象 schema 与非表导出）
const TABLES: TableLike[] = Object.entries(schema)
  .filter(([key, value]) => {
    if (key === "schema") return false; // 聚合导出对象，非表
    try {
      const cfg = getTableConfig(value as TableLike);
      return typeof cfg.name === "string" && cfg.name.length > 0;
    } catch {
      return false;
    }
  })
  .map(([, value]) => value as TableLike);

/** 确保本地数据库文件存在（无则创建）。
 *  libsql 的 file: 客户端是惰性连接：父目录不存在会 SQLITE_CANTOPEN；
 *  首次 execute 才真正建文件。这里先保证目录存在，再交由后续 CREATE TABLE 建库+建表。
 *  仅对 file: 本地 SQLite 生效；libsql: 云端 URL 跳过。 */
function ensureDatabaseFile(): void {
  const url = env.DATABASE_URL;
  if (!url.startsWith("file:")) return; // 仅本地 SQLite 需要
  const path = url.slice("file:".length); // 去掉 "file:" 前缀
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (e) {
    console.error("[db] 无法创建数据库目录", dirname(path), e);
  }
}

/** 幂等建表 + 索引（供桌面主进程启动时调用一次） */
export async function ensureSchema(): Promise<void> {
  ensureDatabaseFile();
  // 本地 SQLite 强制 WAL 模式：Turso 嵌入式副本 / CLI 上传要求本地库为 WAL；
  // 同时在写多读少场景下提升并发（读写互不阻塞）。仅对 file: 本地库生效，云端模式跳过。
  if (env.DATABASE_MODE === "file") {
    await db.run(sql.raw("PRAGMA journal_mode=WAL"));
  }
  for (const table of TABLES) {
    const cfg = getTableConfig(table) as unknown as {
      name: string;
      columns: Array<{ name: string; getSQLType(): string; primary: boolean; notNull: boolean }>;
      indexes?: Array<{ config: { name: string; columns: Array<{ name: string }>; unique: boolean } }>;
    };

    const colDefs = cfg.columns.map((col) => {
      const parts = [`"${col.name}"`, col.getSQLType()];
      if (col.primary) parts.push("PRIMARY KEY");
      else if (col.notNull) parts.push("NOT NULL");
      return parts.join(" ");
    });

    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS "${cfg.name}" (${colDefs.join(", ")})`));

    for (const idx of cfg.indexes ?? []) {
      const c = idx.config;
      const cols = c.columns.map((col) => `"${col.name}"`).join(", ");
      const unique = c.unique ? "UNIQUE " : "";
      await db.run(sql.raw(`CREATE ${unique}INDEX IF NOT EXISTS "${c.name}" ON "${cfg.name}" (${cols})`));
    }
  }
}
