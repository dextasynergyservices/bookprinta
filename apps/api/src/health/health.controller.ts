import { Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthService } from "./health.service.js";

@ApiTags("Health")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /api/v1/health/ping
   * Explicit keep-warm endpoint for external monitors.
   * Used by UptimeRobot / external cron to prevent Render and Neon cold starts.
   */
  @Get("ping")
  @ApiOperation({
    summary: "Lightweight keep-warm ping",
    description:
      "Preferred keep-alive endpoint for UptimeRobot or UptimeBoot. " +
      "Warms DB and Redis with short timeouts and returns runtime cold-start telemetry.",
  })
  @ApiResponse({
    status: 200,
    description: "Service is running and keep-warm ping completed",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        timestamp: { type: "string", example: "2026-03-10T10:30:00.000Z" },
        uptime: { type: "number", example: 3600, description: "Uptime in seconds" },
        runtime: {
          type: "object",
          properties: {
            processStartedAt: { type: "string", nullable: false },
            bootstrapStartedAt: { type: "string", nullable: true },
            bootstrapCompletedAt: { type: "string", nullable: true },
            startupDurationMs: { type: "number", nullable: true, example: 1850 },
            firstRequest: {
              nullable: true,
              type: "object",
              properties: {
                method: { type: "string", example: "GET" },
                path: { type: "string", example: "/api/v1/health/ping" },
                statusCode: { type: "number", example: 200 },
                durationMs: { type: "number", example: 34 },
                completedAt: { type: "string", example: "2026-03-10T10:30:02.000Z" },
                msSinceBootstrapCompleted: { type: "number", nullable: true, example: 145 },
              },
            },
          },
        },
      },
    },
  })
  ping() {
    return this.healthService.ping();
  }

  /**
   * GET /api/v1/health
   * Legacy keep-alive alias retained for backward compatibility.
   */
  @Get()
  @ApiOperation({
    summary: "Legacy basic health check",
    description:
      "Backward-compatible alias for GET /api/v1/health/ping. " +
      "Prefer /health/ping for new keep-alive monitors.",
  })
  @ApiResponse({
    status: 200,
    description: "Service is running",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        timestamp: { type: "string", example: "2026-02-22T10:30:00.000Z" },
        uptime: { type: "number", example: 3600, description: "Uptime in seconds" },
        runtime: {
          type: "object",
          properties: {
            processStartedAt: { type: "string", nullable: false },
            bootstrapStartedAt: { type: "string", nullable: true },
            bootstrapCompletedAt: { type: "string", nullable: true },
            startupDurationMs: { type: "number", nullable: true, example: 1850 },
            firstRequest: {
              nullable: true,
              type: "object",
              properties: {
                method: { type: "string", example: "GET" },
                path: { type: "string", example: "/api/v1/health/ping" },
                statusCode: { type: "number", example: 200 },
                durationMs: { type: "number", example: 34 },
                completedAt: { type: "string", example: "2026-03-10T10:30:02.000Z" },
                msSinceBootstrapCompleted: { type: "number", nullable: true, example: 145 },
              },
            },
          },
        },
      },
    },
  })
  check() {
    return this.healthService.check();
  }

  /**
   * GET /api/v1/health/status
   * Detailed status check: DB, Redis connectivity.
   * Useful for debugging and monitoring dashboards.
   */
  @Get("status")
  @ApiOperation({
    summary: "Detailed service status",
    description:
      "Pings database (Neon PostgreSQL), Redis (Upstash), Gotenberg (PDF engine), and Scanner (ClamAV/VirusTotal) to verify connectivity. " +
      "Returns per-service latency and overall health status (ok / degraded).",
  })
  @ApiResponse({
    status: 200,
    description: "Detailed service health report",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "degraded"], example: "ok" },
        timestamp: { type: "string", example: "2026-02-22T10:30:00.000Z" },
        uptime: { type: "number", example: 3600 },
        runtime: {
          type: "object",
          properties: {
            processStartedAt: { type: "string", nullable: false },
            bootstrapStartedAt: { type: "string", nullable: true },
            bootstrapCompletedAt: { type: "string", nullable: true },
            startupDurationMs: { type: "number", nullable: true, example: 1850 },
            firstRequest: {
              nullable: true,
              type: "object",
              properties: {
                method: { type: "string", example: "GET" },
                path: { type: "string", example: "/api/v1/health/ping" },
                statusCode: { type: "number", example: 200 },
                durationMs: { type: "number", example: 34 },
                completedAt: { type: "string", example: "2026-03-10T10:30:02.000Z" },
                msSinceBootstrapCompleted: { type: "number", nullable: true, example: 145 },
              },
            },
          },
        },
        rollout: {
          type: "object",
          properties: {
            environment: {
              type: "string",
              enum: ["development", "test", "staging", "production", "unknown"],
              example: "staging",
            },
            allowInFlightAccess: { type: "boolean", example: true },
            features: {
              type: "object",
              properties: {
                bookWorkspace: { type: "boolean", example: true },
                manuscriptPipeline: { type: "boolean", example: true },
                billingGate: { type: "boolean", example: true },
                finalPdf: { type: "boolean", example: false },
              },
            },
          },
        },
        services: {
          type: "object",
          properties: {
            database: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                latencyMs: { type: "number", example: 12 },
              },
            },
            redis: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                latencyMs: { type: "number", example: 5 },
              },
            },
            gotenberg: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                latencyMs: { type: "number", example: 45 },
              },
            },
            gemini: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                latencyMs: { type: "number", example: 0 },
                provider: { type: "string", example: "gemini-2.5-flash" },
              },
            },
            scanner: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                latencyMs: { type: "number", example: 20 },
                provider: { type: "string", example: "clamav" },
              },
            },
          },
        },
        queues: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "degraded", "error"], example: "ok" },
            provider: { type: "string", example: "bullmq" },
            connectionSource: {
              type: "string",
              enum: ["env", "localhost_fallback"],
              example: "env",
            },
            aiFormatting: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                queueName: { type: "string", example: "ai-formatting" },
                latencyMs: { type: "number", example: 8 },
                counts: {
                  type: "object",
                  properties: {
                    waiting: { type: "number", example: 0 },
                    active: { type: "number", example: 1 },
                    delayed: { type: "number", example: 0 },
                    failed: { type: "number", example: 2 },
                    completed: { type: "number", example: 14 },
                    prioritized: { type: "number", example: 0 },
                    waitingChildren: { type: "number", example: 0 },
                  },
                },
                error: { type: "string", nullable: true, example: "Connection is closed." },
              },
            },
            pageCount: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                queueName: { type: "string", example: "page-count" },
                latencyMs: { type: "number", example: 5 },
                counts: {
                  type: "object",
                  properties: {
                    waiting: { type: "number", example: 0 },
                    active: { type: "number", example: 0 },
                    delayed: { type: "number", example: 0 },
                    failed: { type: "number", example: 0 },
                    completed: { type: "number", example: 10 },
                    prioritized: { type: "number", example: 0 },
                    waitingChildren: { type: "number", example: 0 },
                  },
                },
              },
            },
            pdfGeneration: {
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                queueName: { type: "string", example: "pdf-generation" },
                latencyMs: { type: "number", example: 4 },
                counts: {
                  type: "object",
                  properties: {
                    waiting: { type: "number", example: 0 },
                    active: { type: "number", example: 0 },
                    delayed: { type: "number", example: 0 },
                    failed: { type: "number", example: 0 },
                    completed: { type: "number", example: 3 },
                    prioritized: { type: "number", example: 0 },
                    waitingChildren: { type: "number", example: 0 },
                  },
                },
              },
            },
            persistedJobs: {
              type: "object",
              properties: {
                activeTotal: { type: "number", example: 1 },
                staleTotal: { type: "number", example: 0 },
                byType: {
                  type: "object",
                  properties: {
                    AI_CLEANING: {
                      type: "object",
                      properties: {
                        queued: { type: "number", example: 1 },
                        processing: { type: "number", example: 0 },
                        stale: { type: "number", example: 0 },
                      },
                    },
                    PAGE_COUNT: {
                      type: "object",
                      properties: {
                        queued: { type: "number", example: 0 },
                        processing: { type: "number", example: 0 },
                        stale: { type: "number", example: 0 },
                      },
                    },
                    PDF_GENERATION: {
                      type: "object",
                      properties: {
                        queued: { type: "number", example: 0 },
                        processing: { type: "number", example: 0 },
                        stale: { type: "number", example: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  status() {
    return this.healthService.detailedStatus();
  }

  @Post("dev/queues/reset")
  @ApiOperation({
    summary: "Development queue reset",
    description:
      "Development/test only. Pauses BullMQ queues, refuses to run if any active jobs exist, clears queued/delayed/completed/failed jobs, and marks persisted pipeline jobs as failed so a fresh local retry can be queued safely.",
  })
  @ApiResponse({
    status: 200,
    description: "Local development queue cleanup completed",
    schema: {
      type: "object",
      properties: {
        environment: { type: "string", enum: ["development", "test"], example: "development" },
        cleared: { type: "boolean", example: true },
        connectionSource: {
          type: "string",
          enum: ["env", "localhost_fallback"],
          example: "env",
        },
        databaseJobsFailed: { type: "number", example: 2 },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "Queue cleanup is only available in development and test environments",
  })
  @ApiResponse({
    status: 409,
    description: "Queue cleanup refused because active jobs are still running",
  })
  resetDevelopmentQueues() {
    return this.healthService.resetDevelopmentQueues();
  }
}
