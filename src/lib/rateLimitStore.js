import { createClient } from "redis";
import { RedisStore } from "rate-limit-redis";
import { config } from "../config/index.js";

let redisClient = null;
let sharedStore = null;
let backend = "memory";
let initPromise = null;

export function getRateLimitBackend() {
  return backend;
}

export function isRedisConfigured() {
  return Boolean(config.redis.url);
}

export function isRedisConnected() {
  return Boolean(redisClient?.isOpen);
}

export function getRateLimitStore() {
  return sharedStore;
}

/** Connect Redis for distributed rate limits when REDIS_URL is set. */
export async function initRateLimitStore() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!config.redis.url || process.env.NODE_ENV === "test") {
      backend = "memory";
      return;
    }

    try {
      redisClient = createClient({ url: config.redis.url });
      redisClient.on("error", (err) => {
        console.error("[rate-limit] Redis error:", err.message);
      });
      await redisClient.connect();
      sharedStore = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: config.redis.rateLimitPrefix,
      });
      backend = "redis";
      console.log("[rate-limit] Using Redis store");
    } catch (err) {
      backend = "memory";
      sharedStore = null;
      console.warn("[rate-limit] Redis unavailable — using in-memory store:", err.message);
    }
  })();

  return initPromise;
}
