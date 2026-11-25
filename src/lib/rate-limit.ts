type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60000;

// Drop expired buckets so a high-cardinality key space (per-IP/email) can't grow the map without bound.
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  buckets.set(key, entry);
  return { allowed: true, remaining: max - entry.count };
}
