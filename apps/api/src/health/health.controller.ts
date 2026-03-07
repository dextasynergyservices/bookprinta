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
      "Keep-alive endpoint that also warms DB and Redis connections. " +
      "Point UptimeRobot or similar monitoring here at 5-minute intervals to prevent Render and Neon cold starts.",
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
                provider: { type: "string", example: "gemini-1.5-flash" },
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
      },
    },
  })
  status() {
    return this.healthService.detailedStatus();
  }
}
