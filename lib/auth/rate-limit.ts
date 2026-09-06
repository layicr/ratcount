/**
 * 内存限流：简单内存计数（单实例足够；多实例可换 DB/Redis）
 *  - 按 key 维度自定义（如 register:<ip>、captcha:<ip>），窗口与上限可配
 */
const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_MAX = 5;

const CAPTCHA_WINDOW_MS = 60 * 1000;
const CAPTCHA_MAX = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimit {
  windowMs: number;
  max: number;
}

export const REGISTER_LIMIT: RateLimit = {
  windowMs: REGISTER_WINDOW_MS,
  max: REGISTER_MAX,
};
export const CAPTCHA_LIMIT: RateLimit = {
  windowMs: CAPTCHA_WINDOW_MS,
  max: CAPTCHA_MAX,
};

/** 是否允许继续尝试（按 key + 自定义窗口/上限） / Whether attempt is allowed */
export function allowAttempt(key: string, limit: RateLimit = REGISTER_LIMIT): boolean {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now > rec.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= limit.max;
}

/** 剩余尝试次数 / Remaining attempts */
export function remainingAttempts(key: string, limit: RateLimit = REGISTER_LIMIT): number {
  const rec = buckets.get(key);
  if (!rec) return limit.max;
  const now = Date.now();
  if (now > rec.resetAt) return limit.max;
  return Math.max(0, limit.max - rec.count);
}

/** 重置某 key（成功时调用）/ Reset a key on success */
export function resetAttempts(key: string): void {
  buckets.delete(key);
}
