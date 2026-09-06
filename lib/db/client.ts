// ratcount · 数据库客户端（本地 SQLite / Turso 云端 双部署）
// 双部署核心：仅切换 DATABASE_MODE 一个环境变量
import { createClient, type Client } from "@libsql/client";
import { env } from "@/lib/env";

/** 数据库模式 */
export type DbMode = "file" | "libsql";

const mode = env.DATABASE_MODE as DbMode;
const url = env.DATABASE_URL;

// —— 健壮性配置（环境变量可覆盖，均有默认值）——
// concurrency：驱动层并发上限，是最接近“连接池”的杠杆（默认 20，单实例足够）。
//   注：@libsql/client 0.15 未暴露 requestTimeout / 连接池 概念，故超时在下方以
//   Promise.race 软超时实现，重试与日志以客户端包装器实现。
const CONCURRENCY = env.DB_CONCURRENCY;
// 单条语句软超时（毫秒）：到点即 reject，底层请求仍在后台继续但结果被丢弃
const STATEMENT_TIMEOUT_MS = env.DB_STATEMENT_TIMEOUT_MS;
const MAX_RETRIES = env.DB_MAX_RETRIES;
const RETRY_BASE_DELAY_MS = env.DB_RETRY_BASE_DELAY_MS;

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 瞬时可重试错误：并发写冲突 / 锁等待 / 网络抖动；超时与确定性错误不重试（避免重复写入） */
function isRetryable(err: unknown): boolean {
  const m = msgOf(err);
  return (
    /SQLITE_BUSY|SQLITE_LOCKED|database is locked|busy|ECONNRESET|ETIMEDOUT|socket hang up|ECONNREFUSED/i.test(m) &&
    !/超时/.test(m)
  );
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 软超时：到点即 reject（驱动无 abort，底层请求不取消，仅丢弃其结果） */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[db] ${label} 超时（>${ms}ms）`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** 安全重试：单语句 / 原子批（失败即整体回滚，可安全重放） */
async function runWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(fn(), STATEMENT_TIMEOUT_MS, label);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES && isRetryable(e)) {
        console.error(`[db] ${label} 失败，第 ${attempt + 1} 次重试:`, msgOf(e));
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      console.error(`[db] ${label} 最终失败:`, msgOf(e));
      throw e;
    }
  }
  throw lastErr;
}

/** 仅日志（不重试）：事务内语句（防部分重放导致重复写入）/ 非事务脚本 / 迁移 / 同步 */
async function runWithLog<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await withTimeout(fn(), STATEMENT_TIMEOUT_MS, label);
  } catch (e) {
    console.error(`[db] ${label} 失败:`, msgOf(e));
    throw e;
  }
}

/** 为客户端增加：超时 + 错误日志 + 瞬时重试；事务对象仅日志（安全） */
function enhance(client: Client): Client {
  const wrapTx = (tx: unknown): unknown =>
    new Proxy(tx as object, {
      get(target, prop, receiver) {
        // commit / rollback 必须绑定原始事务对象（私有字段 #database 依赖 this 绑定），
        // 否则经 Proxy 调用会抛 "Cannot read private member" 且事务无法正常关闭、遗留写锁
        if (prop === "commit" || prop === "rollback") {
          const fn = Reflect.get(target, prop, receiver);
          return typeof fn === "function" ? fn.bind(target) : fn;
        }
        const value = Reflect.get(target, prop, receiver);
        if (
          typeof value === "function" &&
          (prop === "execute" || prop === "batch" || prop === "executeMultiple")
        ) {
          return (...args: unknown[]) =>
            runWithLog(
              () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
              `transaction.${String(prop)}`,
            );
        }
        return value;
      },
    });

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "execute" || prop === "batch") {
        return (...args: unknown[]) =>
          runWithRetry(
            () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
            `client.${String(prop)}`,
          );
      }
      if (prop === "executeMultiple" || prop === "migrate" || prop === "sync") {
        return (...args: unknown[]) =>
          runWithLog(
            () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
            `client.${String(prop)}`,
          );
      }
      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          const tx = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          return wrapTx(tx);
        };
      }
      return value;
    },
  }) as Client;
}

const base: Client =
  mode === "libsql"
    ? createClient({ url, authToken: env.TURSO_AUTH_TOKEN, concurrency: CONCURRENCY })
    : createClient({ url, concurrency: CONCURRENCY });

/** 经并发限制 / 超时 / 重试 / 错误日志增强的数据库客户端 */
export const sqlite: Client = enhance(base);
