/**
 * 限流：可插拔存储 / Pluggable rate-limit store
 *  - 默认内存（单实例）：行为与旧实现一致
 *  - 配置 REDIS_URL 后自动走 Redis（多实例 Serverless 分布式限流）；
 *    Redis 未配置或不可用时优雅回退内存，保证可用性
 * In-memory by default; Redis (distributed) when REDIS_URL is set, with graceful fallback to memory.
 */
const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_MAX = 5;

const CAPTCHA_WINDOW_MS = 60 * 1000;
const CAPTCHA_MAX = 10;

const EXPORT_WINDOW_MS = 60 * 1000;
const EXPORT_MAX = 10;

export interface RateLimit {
  windowMs: number;
  max: number;
}

export const REGISTER_LIMIT: RateLimit = { windowMs: REGISTER_WINDOW_MS, max: REGISTER_MAX };
export const CAPTCHA_LIMIT: RateLimit = { windowMs: CAPTCHA_WINDOW_MS, max: CAPTCHA_MAX };
/** 导出限流：重操作（全量扫描 + 内存生成 XLSX），按用户维度限速 / Export limit: heavy op, throttled per user */
export const EXPORT_LIMIT: RateLimit = { windowMs: EXPORT_WINDOW_MS, max: EXPORT_MAX };

// ==================== 内存存储（单实例默认）/ In-memory store ====================
const mem = new Map<string, { count: number; resetAt: number }>();

function memAllow(key: string, limit: RateLimit): boolean {
  const now = Date.now();
  const rec = mem.get(key);
  if (!rec || now > rec.resetAt) {
    mem.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= limit.max;
}
function memRemaining(key: string, limit: RateLimit): number {
  const rec = mem.get(key);
  if (!rec) return limit.max;
  if (Date.now() > rec.resetAt) return limit.max;
  return Math.max(0, limit.max - rec.count);
}
function memReset(key: string): void {
  mem.delete(key);
}

// ==================== Redis 存储（可选，REDIS_URL 启用）/ Redis store (optional) ====================
const REDIS_PREFIX = "ratcount:ratelimit:";
let redisClientPromise: Promise<any> | null = null;

async function getRedis(): Promise<any | null> {
  if (!process.env.REDIS_URL) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        // @ts-ignore 动态依赖：启用分布式限流需 `npm i redis`（未安装时不启用，自动回退内存）
        const { createClient } = await import("redis");
        const client: any = createClient({ url: process.env.REDIS_URL });
        client.on("error", () => {});
        await client.connect();
        return client;
      } catch {
        return null;
      }
    })();
  }
  const c = await redisClientPromise;
  return c ?? null;
}

// ==================== 公共 API（异步，兼容分布式）/ Public API (async) ====================
export async function allowAttempt(key: string, limit: RateLimit = REGISTER_LIMIT): Promise<boolean> {
  const r = await getRedis();
  if (!r) return memAllow(key, limit);
  const k = REDIS_PREFIX + key;
  const ttl = Math.ceil(limit.windowMs / 1000);
  try {
    const exists = await r.exists(k);
    if (!exists) {
      await r.set(k, "1", { EX: ttl });
      return true;
    }
    return (await r.incr(k)) <= limit.max;
  } catch {
    return memAllow(key, limit);
  }
}

export async function remainingAttempts(key: string, limit: RateLimit = REGISTER_LIMIT): Promise<number> {
  const r = await getRedis();
  if (!r) return memRemaining(key, limit);
  try {
    const n = await r.get(REDIS_PREFIX + key);
    return n ? Math.max(0, limit.max - Number(n)) : limit.max;
  } catch {
    return memRemaining(key, limit);
  }
}

export async function resetAttempts(key: string): Promise<void> {
  const r = await getRedis();
  if (!r) {
    memReset(key);
    return;
  }
  try {
    await r.del(REDIS_PREFIX + key);
  } catch {
    memReset(key);
  }
}
