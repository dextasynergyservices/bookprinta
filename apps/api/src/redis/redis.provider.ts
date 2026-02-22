import { Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "./redis.constants.js";

const logger = new Logger("RedisProvider");

/**
 * Provides a configured ioredis connection using REDIS_URL.
 *
 * Upstash Redis requires TLS — ioredis parses `rediss://` URLs automatically.
 * For local development, Docker Redis uses `redis://localhost:6379`.
 *
 * If REDIS_URL is not set, the provider logs a warning and returns null.
 * The server still boots — Redis-dependent features (BullMQ jobs, caching)
 * will be unavailable until configured. See CLAUDE.md Section 22 (Graceful Degradation).
 */
export const RedisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis | null => {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn(
        "REDIS_URL environment variable not set. " +
          "Redis-dependent features (BullMQ jobs, caching) will be unavailable."
      );
      return null;
    }

    const redis = new Redis(redisUrl, {
      // Upstash requires TLS — ioredis handles this via the rediss:// scheme.
      // For local Docker Redis (redis://), TLS is skipped automatically.
      maxRetriesPerRequest: null, // Required by BullMQ — disables default retry limit
      enableReadyCheck: true,
      connectTimeout: 5000, // 5s max for initial TCP connection (prevents cold-start hangs)
      retryStrategy(times: number) {
        // Exponential backoff: 50ms, 100ms, 200ms... up to 5s
        const delay = Math.min(times * 50, 5000);
        logger.warn(`Redis connection retry #${times} in ${delay}ms`);
        return delay;
      },
    });

    redis.on("connect", () => {
      logger.log("Redis connected successfully");
    });

    redis.on("ready", () => {
      logger.log("Redis ready to accept commands");
    });

    redis.on("error", (error: Error) => {
      logger.error(`Redis connection error: ${error.message}`);
    });

    redis.on("close", () => {
      logger.warn("Redis connection closed");
    });

    return redis;
  },
};
