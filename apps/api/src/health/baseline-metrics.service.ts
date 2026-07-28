import { timingSafeEqual } from "node:crypto";
import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  getRedisCommandMeterSnapshot,
  type RedisCommandMeterSnapshot,
  resetRedisCommandMeter,
} from "./redis-command-meter.js";
import { type MemoryHighWater, RuntimeTelemetryService } from "./runtime-telemetry.service.js";

export type BaselineSnapshot = {
  capturedAt: string;
  uptimeSeconds: number;
  redisCommands: RedisCommandMeterSnapshot;
  memory: MemoryHighWater;
};

/**
 * BaselineMetricsService — serves Phase 0 baseline data
 * (docs/infra-cost-hardening-plan.md).
 *
 * Access control: a shared bearer token via BASELINE_METRICS_TOKEN, compared in
 * constant time. Deliberately NOT wired to the auth module — this is temporary
 * instrumentation and should not create a dependency that outlives it. Phase 2
 * introduces proper admin auth for the operational health surface; this endpoint
 * is expected to be deleted before then.
 *
 * If BASELINE_METRICS_TOKEN is unset the endpoint is disabled outright, so
 * deploying this code without configuring it exposes nothing.
 */
@Injectable()
export class BaselineMetricsService {
  constructor(private readonly runtimeTelemetry: RuntimeTelemetryService) {}

  private assertAuthorised(presentedToken: string | undefined): void {
    const expected = process.env.BASELINE_METRICS_TOKEN?.trim();

    if (!expected) {
      throw new ServiceUnavailableException(
        "Baseline metrics are disabled. Set BASELINE_METRICS_TOKEN to enable."
      );
    }

    const presented = presentedToken?.trim() ?? "";
    const expectedBuffer = Buffer.from(expected, "utf8");
    const presentedBuffer = Buffer.from(presented, "utf8");

    // timingSafeEqual throws on length mismatch, so compare lengths first —
    // but still run the comparison to keep the failure path constant-ish.
    const lengthMatches = expectedBuffer.length === presentedBuffer.length;
    const contentMatches = lengthMatches && timingSafeEqual(expectedBuffer, presentedBuffer);

    if (!contentMatches) {
      throw new ForbiddenException("Invalid baseline metrics token");
    }
  }

  getSnapshot(token: string | undefined): BaselineSnapshot {
    this.assertAuthorised(token);

    // Force a fresh memory sample so the reading reflects this instant, not
    // whatever the 15s sampler last saw.
    this.runtimeTelemetry.sampleMemory();

    return {
      capturedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      redisCommands: getRedisCommandMeterSnapshot(),
      memory: this.runtimeTelemetry.getMemoryHighWater(),
    };
  }

  /**
   * Reset both counters to start a clean observation window — used to isolate a
   * single pipeline run from ambient idle traffic.
   */
  reset(token: string | undefined): { reset: true; at: string } {
    this.assertAuthorised(token);

    resetRedisCommandMeter();
    this.runtimeTelemetry.resetMemoryHighWater();

    return { reset: true, at: new Date().toISOString() };
  }
}
