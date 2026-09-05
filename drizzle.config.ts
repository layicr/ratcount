import { defineConfig } from "drizzle-kit";

/** Drizzle 迁移配置：本地 SQLite / Turso 共用同一套 schema */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/ratcount.db",
  },
});
