/**
 * 登录限流：简单内存计数（单实例足够；多实例可换 DB/Redis）
 *  - 每 IP 每 15 分钟最多 MAX 次失败
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 5;

const hits = new Map<string, { count: number; resetAt: number }>();

/** 是否允许继续尝试 / Whether attempt is allowed */
export function allowAttempt(key: string): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  rec.count += 1;
  return rec.count <= MAX;
}

/** 剩余尝试次数 / Remaining attempts */
export function remainingAttempts(key: string): number {
  const rec = hits.get(key);
  if (!rec) return MAX;
  const now = Date.now();
  if (now > rec.resetAt) return MAX;
  return Math.max(0, MAX - rec.count);
}

/** 重置某 key（登录成功时调用）/ Reset a key on success */
export function resetAttempts(key: string): void {
  hits.delete(key);
}
