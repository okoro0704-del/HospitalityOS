/** In-memory sliding-window rate limiter (suitable for single-process API). */

const buckets = new Map<string, number[]>();

/**
 * Record an attempt for `key` and return whether it is allowed.
 * @returns `true` if under the limit (allowed), `false` if rate-limited.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  let timestamps = buckets.get(key) ?? [];
  timestamps = timestamps.filter((t) => t > windowStart);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

/** Test / maintenance helper — clears all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
