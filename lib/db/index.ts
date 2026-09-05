import { drizzle } from "drizzle-orm/libsql";
import { sqlite } from "./client";
import { schema } from "@/db/schema";

/** Drizzle 实例：类型安全 + schema 注册 */
export const db = drizzle(sqlite, { schema });

export * from "@/db/schema";
