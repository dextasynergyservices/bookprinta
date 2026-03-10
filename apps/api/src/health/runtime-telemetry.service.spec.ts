/// <reference types="jest" />
import { RuntimeTelemetryService } from "./runtime-telemetry.service.js";

describe("RuntimeTelemetryService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tracks bootstrap timing and only records the first completed request once", () => {
    const service = new RuntimeTelemetryService();

    service.markBootstrapStarted(1_000);
    const bootstrapSnapshot = service.markBootstrapCompleted(2_500);

    expect(bootstrapSnapshot.startupDurationMs).toBe(1500);
    expect(bootstrapSnapshot.firstRequest).toBeNull();

    const firstRequest = service.recordFirstRequest({
      method: "GET",
      path: "/api/v1/health/ping",
      statusCode: 200,
      durationMs: 42,
      completedAtMs: 2_900,
    });

    expect(firstRequest).toMatchObject({
      method: "GET",
      path: "/api/v1/health/ping",
      statusCode: 200,
      durationMs: 42,
      msSinceBootstrapCompleted: 400,
    });

    const ignoredSecond = service.recordFirstRequest({
      method: "GET",
      path: "/api/v1/orders",
      statusCode: 200,
      durationMs: 15,
      completedAtMs: 3_100,
    });

    expect(ignoredSecond).toBeNull();
    expect(service.getSnapshot().firstRequest?.path).toBe("/api/v1/health/ping");
  });
});
