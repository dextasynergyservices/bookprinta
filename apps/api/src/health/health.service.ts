import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Lightweight health check — no external calls.
   * Returns immediately so keep-alive pings are fast.
   */
  check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  /**
   * Detailed status check — pings DB and Redis.
   * Used for monitoring dashboards and debugging.
   */
  async detailedStatus() {
    const results: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Database (Neon PostgreSQL via Prisma)
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      results.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch (error) {
      results.database = {
        status: "error",
        latencyMs: Date.now() - dbStart,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.logger.warn("Database health check failed", error);
    }

    // Redis (Upstash)
    const redisStart = Date.now();
    try {
      const client = this.redisService.getClient();
      if (client) {
        await client.ping();
        results.redis = { status: "ok", latencyMs: Date.now() - redisStart };
      } else {
        results.redis = { status: "unavailable", latencyMs: 0 };
      }
    } catch (error) {
      results.redis = {
        status: "error",
        latencyMs: Date.now() - redisStart,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.logger.warn("Redis health check failed", error);
    }

    // Gotenberg (PDF generation — separate Render service)
    const gotenbergUrl = process.env.GOTENBERG_URL;
    if (gotenbergUrl) {
      const gbStart = Date.now();
      try {
        const response = await fetch(`${gotenbergUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        results.gotenberg = {
          status: response.ok ? "ok" : "error",
          latencyMs: Date.now() - gbStart,
        };
      } catch (error) {
        results.gotenberg = {
          status: "error",
          latencyMs: Date.now() - gbStart,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        this.logger.warn("Gotenberg health check failed", error);
      }
    } else {
      results.gotenberg = { status: "not_configured", latencyMs: 0 };
    }

    const allHealthy = Object.values(results).every(
      (r) => r.status === "ok" || r.status === "not_configured"
    );

    return {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      services: results,
    };
  }
}
