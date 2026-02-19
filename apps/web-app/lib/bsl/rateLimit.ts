const windowMs = 60_000; // 1 minute
const maxRequests = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}


