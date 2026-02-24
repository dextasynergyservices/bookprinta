import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { ScannerService } from "../scanner/scanner.service.js";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly scanner: ScannerService
  ) {}

  /**
   * Keep-alive health check — pings DB and Redis to keep connections warm.
   *
   * Why this touches the DB: Neon PostgreSQL (serverless) suspends after ~5 min
   * of inactivity. If UptimeRobot only keeps the Node process alive but not the
   * DB connection, the first real request (e.g. contact form) triggers a Neon
   * cold start → 10-30s delay → Render's 30s proxy timeout → CORS-less error.
   *
   * The DB/Redis pings run concurrently and have short timeouts so this endpoint
   * still responds in < 2 seconds even if a dependency is slow.
   */
  async check() {
    // Fire DB + Redis pings concurrently — don't block on either
    const warmups = [
      this.prisma.$queryRawUnsafe("SELECT 1").catch((err: unknown) => {
        this.logger.warn("Health: DB warmup failed", err);
      }),
    ];

    const redis = this.redisService.getClient();
    if (redis) {
      warmups.push(
        redis.ping().catch((err: unknown) => {
          this.logger.warn("Health: Redis warmup failed", err);
        })
      );
    }

    // Wait for both but cap at 5s so the endpoint always responds fast
    await Promise.race([
      Promise.allSettled(warmups),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  /**
   * Detailed status check — pings DB, Redis, and Gotenberg.
   * All checks have individual timeouts to prevent hanging.
   * Used for monitoring dashboards and debugging.
   */
  async detailedStatus() {
    const results: Record<
      string,
      { status: string; latencyMs?: number; error?: string; provider?: string }
    > = {};

    // Helper: race a promise against a timeout
    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ]);

    // Database (Neon PostgreSQL via Prisma) — 10s timeout
    const dbStart = Date.now();
    try {
      await withTimeout(this.prisma.$queryRawUnsafe("SELECT 1"), 10000, "Database");
      results.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch (error) {
      results.database = {
        status: "error",
        latencyMs: Date.now() - dbStart,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.logger.warn("Database health check failed", error);
    }

    // Redis (Upstash) — 5s timeout
    const redisStart = Date.now();
    try {
      const client = this.redisService.getClient();
      if (client) {
        await withTimeout(client.ping(), 5000, "Redis");
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

    // Scanner (ClamAV or VirusTotal) — 10s timeout
    const scannerStart = Date.now();
    try {
      const available = await withTimeout(this.scanner.isAvailable(), 10000, "Scanner");
      results.scanner = {
        status: available ? "ok" : "error",
        latencyMs: Date.now() - scannerStart,
        ...(available ? {} : { error: "Scanner is not reachable" }),
        provider: this.scanner.getProviderName(),
      };
    } catch (error) {
      results.scanner = {
        status: "error",
        latencyMs: Date.now() - scannerStart,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: this.scanner.getProviderName(),
      };
      this.logger.warn("Scanner health check failed", error);
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
