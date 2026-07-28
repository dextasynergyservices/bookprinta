/// <reference types="jest" />
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { BaselineMetricsService } from "./baseline-metrics.service.js";
import { RuntimeTelemetryService } from "./runtime-telemetry.service.js";

describe("BaselineMetricsService", () => {
  const originalToken = process.env.BASELINE_METRICS_TOKEN;

  function build() {
    return new BaselineMetricsService(new RuntimeTelemetryService());
  }

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BASELINE_METRICS_TOKEN;
    } else {
      process.env.BASELINE_METRICS_TOKEN = originalToken;
    }
    jest.restoreAllMocks();
  });

  it("is disabled entirely when BASELINE_METRICS_TOKEN is unset", () => {
    delete process.env.BASELINE_METRICS_TOKEN;

    // Deploying this code without configuring a token must expose nothing —
    // not even to a caller who supplies an empty or arbitrary token.
    expect(() => build().getSnapshot(undefined)).toThrow(ServiceUnavailableException);
    expect(() => build().getSnapshot("anything")).toThrow(ServiceUnavailableException);
  });

  it("rejects a missing, wrong, or wrong-length token", () => {
    process.env.BASELINE_METRICS_TOKEN = "correct-horse-battery-staple";
    const service = build();

    expect(() => service.getSnapshot(undefined)).toThrow(ForbiddenException);
    expect(() => service.getSnapshot("")).toThrow(ForbiddenException);
    expect(() => service.getSnapshot("wrong")).toThrow(ForbiddenException);
    // Same length as the real token — guards against a length-only comparison.
    expect(() => service.getSnapshot("xorrect-horse-battery-stapl3")).toThrow(ForbiddenException);
  });

  it("returns redis command and memory telemetry for a valid token", () => {
    process.env.BASELINE_METRICS_TOKEN = "valid-token";

    const snapshot = build().getSnapshot("valid-token");

    expect(snapshot.capturedAt).toEqual(expect.any(String));
    expect(snapshot.redisCommands).toMatchObject({
      enabled: expect.any(Boolean),
      totalCommands: expect.any(Number),
      byCommand: expect.any(Array),
    });
    // Memory is sampled on demand, so a peak is always present even before the
    // 15s interval sampler has fired.
    expect(snapshot.memory.peakRssMb).toBeGreaterThan(0);
    expect(snapshot.memory.samples).toBeGreaterThan(0);
  });

  it("tolerates surrounding whitespace on the configured token", () => {
    process.env.BASELINE_METRICS_TOKEN = "  spaced-token  ";

    expect(() => build().getSnapshot("spaced-token")).not.toThrow();
  });

  it("requires a valid token to reset counters", () => {
    process.env.BASELINE_METRICS_TOKEN = "valid-token";
    const service = build();

    expect(() => service.reset("nope")).toThrow(ForbiddenException);
    expect(service.reset("valid-token")).toMatchObject({ reset: true });
  });
});
