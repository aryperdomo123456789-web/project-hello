import { getRedisConnection } from "@/queue/redis.server";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindow = Math.max(1, Math.floor(windowSeconds));
  const redisKey = `mago:rate:${key}`;
  const value = await getRedisConnection().eval(
    "local current = redis.call('INCR', KEYS[1]); if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return current;",
    1,
    redisKey,
    safeWindow,
  );
  const count = Number(value);
  const allowed = Number.isFinite(count) && count <= safeLimit;
  return {
    allowed,
    count: Number.isFinite(count) ? count : safeLimit + 1,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - (Number.isFinite(count) ? count : safeLimit)),
    retryAfterSeconds: safeWindow,
  };
}
