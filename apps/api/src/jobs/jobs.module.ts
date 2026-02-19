import { BullModule } from "@nestjs/bullmq";
import { Logger, Module } from "@nestjs/common";
import { QUEUE_AI_FORMATTING, QUEUE_PAGE_COUNT, QUEUE_PDF_GENERATION } from "./jobs.constants.js";

const logger = new Logger("JobsModule");

/**
 * JobsModule — Registers BullMQ queues backed by Redis.
 *
 * Queues registered (CLAUDE.md Section 18.2 & 18.4):
 *  - ai-formatting:   Gemini AI manuscript → semantic HTML (concurrency 1, 5/min)
 *  - pdf-generation:  Gotenberg HTML → print-ready PDF   (concurrency 1, 3/min)
 *  - page-count:      Gotenberg HTML → page count         (concurrency 1, 3/min)
 *
 * Job processors (Workers) will be added in Phase 5.
 * This module only sets up the queues + connection so other modules can
 * inject Queue instances and add jobs.
 *
 * Connection: BullMQ creates its own dedicated ioredis connections internally
 * (separate subscriber + publisher). We parse REDIS_URL into connection options
 * rather than sharing the RedisService client to avoid ioredis version conflicts
 * and follow BullMQ's recommended pattern.
 *
 * The shared RedisService connection remains available for caching, health checks,
 * and any direct Redis operations outside of BullMQ.
 *
 * Graceful degradation: If REDIS_URL is not set, BullMQ uses a lazy localhost
 * fallback. The server still boots, but jobs will fail at dispatch time with
 * a clear Redis connection error. See CLAUDE.md Section 22.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic module pattern requires class with static register()
export class JobsModule {
  /**
   * Dynamically register BullMQ queues with Redis connection options
   * parsed from REDIS_URL.
   */
  static register() {
    return {
      module: JobsModule,
      imports: [
        // Register BullMQ root with parsed Redis connection options
        BullModule.forRoot({
          connection: JobsModule.parseRedisConnection(),
        }),

        // ─────────────────────────────────────────────────────
        // Queue: ai-formatting
        // Gemini AI manuscript formatting (CLAUDE.md Section 18.4)
        // Concurrency: 1, Rate limit: 5 jobs/min
        // Retries: 3 with exponential backoff starting at 5s
        // ─────────────────────────────────────────────────────
        BullModule.registerQueue({
          name: QUEUE_AI_FORMATTING,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000, // 5s → 10s → 20s
            },
            removeOnComplete: {
              count: 100, // Keep last 100 completed jobs for debugging
            },
            removeOnFail: {
              count: 200, // Keep last 200 failed jobs for admin review
            },
          },
        }),

        // ─────────────────────────────────────────────────────
        // Queue: pdf-generation
        // Gotenberg HTML → print-ready PDF (CLAUDE.md Section 18.4)
        // Concurrency: 1, Rate limit: 3 jobs/min
        // Retries: 3 with exponential backoff starting at 5s
        // ─────────────────────────────────────────────────────
        BullModule.registerQueue({
          name: QUEUE_PDF_GENERATION,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: {
              count: 100,
            },
            removeOnFail: {
              count: 200,
            },
          },
        }),

        // ─────────────────────────────────────────────────────
        // Queue: page-count
        // Gotenberg HTML → authoritative page count for billing
        // Triggered after AI formatting + on settings change
        // (CLAUDE.md Section 18.2 step 3)
        // ─────────────────────────────────────────────────────
        BullModule.registerQueue({
          name: QUEUE_PAGE_COUNT,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: {
              count: 100,
            },
            removeOnFail: {
              count: 200,
            },
          },
        }),
      ],
      exports: [BullModule],
    };
  }

  /**
   * Parse REDIS_URL into connection options for BullMQ.
   *
   * Handles both:
   *  - Production: `rediss://user:pass@host:port` (Upstash, TLS via rediss://)
   *  - Local dev:  `redis://localhost:6379` (Docker Redis)
   *
   * Graceful degradation: If REDIS_URL is not set, returns a lazy localhost
   * config. The server boots but jobs will fail at dispatch time.
   */
  private static parseRedisConnection() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn(
        "REDIS_URL not set — BullMQ queues will not be functional. " +
          "Set REDIS_URL to enable background job processing."
      );

      return {
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
        lazyConnect: true,
      };
    }

    const url = new URL(redisUrl);

    logger.log(`BullMQ connecting to Redis at ${url.hostname}:${url.port || 6379}`);

    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null, // Required by BullMQ workers
    };
  }
}
