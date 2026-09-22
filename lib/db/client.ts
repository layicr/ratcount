// ratcount · 数据库客户端（本地 SQLite / Turso 云端 双部署）/ DB client (local SQLite / Turso cloud, dual deploy)
// 双部署核心：DATABASE_URL 以 file: 开头即本地 SQLite，其余为云端（见 lib/env.ts resolveDbMode）/ Core: DATABASE_URL starting with file: → local SQLite; else cloud (see lib/env.ts resolveDbMode)
// 桌面模式复用：Electron 主进程在 import 本模块前把 DATABASE_URL 设为 'file:<userData>/ratcount.db'，
//   本文件（含 enhance 的并发/软超时/重试/事务）原样工作，无需 wa-sqlite / OPFS。
// Desktop reuse: Electron main sets DATABASE_URL='file:<userData>/ratcount.db' before importing this module;
//   the file (incl. enhance's concurrency/timeout/retry/transaction) works unchanged — no wa-sqlite / OPFS.
import { createClient, type Client } from "@libsql/client";
import { env } from "@/lib/env";

/** 数据库模式 / DB mode */
export type DbMode = "file" | "libsql";

const mode: DbMode = env.DATABASE_MODE;
const url = env.DATABASE_URL;

// —— 健壮性配置（环境变量可覆盖，均有默认值）/ Robustness config (env-overridable, all have defaults) ——
// concurrency：驱动层并发上限，是最接近“连接池”的杠杆（默认 20，单实例足够）。
//   注：@libsql/client 0.15 未暴露 requestTimeout / 连接池 概念，故超时在下方以
//   Promise.race 软超时实现，重试与日志以客户端包装器实现。
// concurrency: driver-level cap on in-flight requests, the closest thing to a pool (default 20, enough per instance).
//   Note: @libsql/client 0.15 exposes no requestTimeout / pool concept, so the timeout below is a soft Promise.race; retry & logging via the client wrapper.
const CONCURRENCY = env.DB_CONCURRENCY;
// 单条语句软超时（毫秒）：到点即 reject，底层请求仍在后台继续但结果被丢弃 / Per-statement soft timeout (ms): reject on expiry; the underlying request keeps running but its result is dropped
const STATEMENT_TIMEOUT_MS = env.DB_STATEMENT_TIMEOUT_MS;
const MAX_RETRIES = env.DB_MAX_RETRIES;
const RETRY_BASE_DELAY_MS = env.DB_RETRY_BASE_DELAY_MS;

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 瞬时可重试错误：并发写冲突 / 锁等待 / 网络抖动；超时与确定性错误不重试（避免重复写入）/ Transiently retryable: write contention / lock wait / network jitter; timeouts & deterministic errors are NOT retried (avoid duplicate writes) */
function isRetryable(err: unknown): boolean {
  const m = msgOf(err);
  return (
    /SQLITE_BUSY|SQLITE_LOCKED|database is locked|busy|ECONNRESET|ETIMEDOUT|socket hang up|ECONNREFUSED/i.test(m) &&
    !/超时/.test(m)
  );
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 软超时：到点即 reject（驱动无 abort，底层请求不取消，仅丢弃其结果）。
 *  ms ≤ 0 或非有限值视为「不设超时」，直接返回原 Promise——避免配置为 0 时 setTimeout(...,0)
 *  在下一个 tick 立即 reject，把所有语句误判为「超时」。
 *  Soft timeout: reject on expiry (no abort; result dropped). ms ≤ 0 or non-finite disables the timeout,
 *  so a 0 value can't make every statement fail instantly via setTimeout(...,0). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!(ms > 0)) return p; // 未配置 / ≤0 → 关闭软超时 / unset or ≤ 0 → disabled
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

/** 安全重试：单语句 / 原子批（失败即整体回滚，可安全重放）/ Safe retry: single statement / atomic batch (failed batch rolls back; safe to replay) */
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

/** 仅日志（不重试）：事务内语句（防部分重放导致重复写入）/ 非事务脚本 / 迁移 / 同步 / Log-only (no retry): in-tx statements (avoid partial replay → duplicate writes) / non-tx scripts / migrations / sync */
async function runWithLog<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await withTimeout(fn(), STATEMENT_TIMEOUT_MS, label);
  } catch (e) {
    console.error(`[db] ${label} 失败:`, msgOf(e));
    throw e;
  }
}

/** 为客户端增加：超时 + 错误日志 + 瞬时重试；事务对象仅日志（安全）/ Enhance the client: timeout + error log + transient retry; tx object is log-only (safe) */
function enhance(client: Client): Client {
  const wrapTx = (tx: unknown): unknown =>
    new Proxy(tx as object, {
      get(target, prop, receiver) {
        // commit / rollback 必须绑定原始事务对象（私有字段 #database 依赖 this 绑定），
        // 否则经 Proxy 调用会抛 "Cannot read private member" 且事务无法正常关闭、遗留写锁
        // commit/rollback must bind the original tx object (private #database relies on `this`);
        // calling via Proxy throws "Cannot read private member" and the tx won't close, leaving a write lock.
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

/** 经并发限制 / 超时 / 重试 / 错误日志增强的数据库客户端 / DB client with concurrency cap / timeout / retry / error logging */
export const sqlite: Client = enhance(base);
