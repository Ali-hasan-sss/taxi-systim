import Redis from "ioredis";

export const redisEnabled = (process.env.REDIS_ENABLED ?? "true") === "true";
let loggedOnce = false;

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});

if (redisEnabled) {
  redis.connect().catch(() => {
    if (!loggedOnce) {
      loggedOnce = true;
      // eslint-disable-next-line no-console
      console.warn("[redis] unavailable - continuing without Redis features.");
    }
  });
} else {
  // eslint-disable-next-line no-console
  console.warn("[redis] disabled by REDIS_ENABLED=false");
}
