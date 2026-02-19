import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "./redis.constants.js";

/**
 * RedisService — Wraps the ioredis connection with convenience methods.
 *
 * Provides:
 *  - Direct access to the ioredis client (for BullMQ, custom ops)
 *  - Health check method (for /api/v1/health/status endpoint)
 *  - Graceful shutdown on module destroy
 *
 * In production, REDIS_URL points to Upstash Redis (TLS-enabled).
 * In local dev, it points to the Docker Redis container (redis://localhost:6379).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  /**
   * Returns the raw ioredis client.
   * Used by BullMQ and any module that needs direct Redis access.
   * Returns null if Redis is not configured.
   */
  getClient(): Redis | null {
    return this.redis;
  }

  /**
   * Returns whether Redis is configured and available.
   */
  isAvailable(): boolean {
    return this.redis !== null && this.redis.status === "ready";
  }

  /**
   * Health check — pings Redis and returns latency.
   * Used by the /api/v1/health/status endpoint (CLAUDE.md Section 22).
   */
  async healthCheck(): Promise<{ status: "up" | "down"; latencyMs?: number }> {
    if (!this.redis) {
      return { status: "down" };
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      const latencyMs = Date.now() - start;
      return { status: "up", latencyMs };
    } catch {
      return { status: "down" };
    }
  }

  /**
   * Gracefully disconnect on app shutdown.
   */
  async onModuleDestroy() {
    if (this.redis) {
      this.logger.log("Disconnecting Redis...");
      await this.redis.quit();
      this.logger.log("Redis disconnected");
    }
  }
}
