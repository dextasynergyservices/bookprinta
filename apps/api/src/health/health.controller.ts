import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthService } from "./health.service.js";

@ApiTags("Health")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /api/v1/health
   * Basic keep-alive health check. Returns { status: "ok", uptime }.
   * Used by UptimeRobot / external cron to prevent Render cold starts.
   */
  @Get()
  @ApiOperation({
    summary: "Basic health check",
    description:
      "Lightweight keep-alive endpoint. Returns immediately with no external service calls. " +
      "Point UptimeRobot or similar monitoring here at 5-minute intervals to prevent Render cold starts.",
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
      "Pings database (Neon PostgreSQL), Redis (Upstash), and Gotenberg (PDF engine) to verify connectivity. " +
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
          },
        },
      },
    },
  })
  status() {
    return this.healthService.detailedStatus();
  }
}
