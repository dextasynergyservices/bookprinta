/// <reference types="jest" />
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;
  const originalGotenbergUrl = process.env.GOTENBERG_URL;

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
    process.env.GOTENBERG_URL = originalGotenbergUrl;
    delete process.env.GOTENBERG_USERNAME;
    delete process.env.GOTENBERG_PASSWORD;
    jest.restoreAllMocks();
  });

  it("includes queue observability in detailed status and degrades overall status when queues degrade", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GOTENBERG_URL;

    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    const redisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue("PONG"),
      }),
    };
    const scanner = {
      isAvailable: jest.fn().mockResolvedValue(true),
      getProviderName: jest.fn().mockReturnValue("clamav"),
    };
    const rollout = {
      getMonitoringSnapshot: jest.fn().mockReturnValue({
        environment: "development",
        allowInFlightAccess: true,
        features: {
          bookWorkspace: true,
          manuscriptPipeline: true,
          billingGate: true,
          finalPdf: true,
        },
      }),
    };
    const queueAdmin = {
      collectSummary: jest.fn().mockResolvedValue({
        status: "degraded",
        provider: "bullmq",
        connectionSource: "env",
        aiFormatting: {
          status: "ok",
          queueName: "ai-formatting",
          latencyMs: 3,
          counts: {
            waiting: 1,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 4,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pageCount: {
          status: "ok",
          queueName: "page-count",
          latencyMs: 2,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 4,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pdfGeneration: {
          status: "ok",
          queueName: "pdf-generation",
          latencyMs: 2,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 1,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        persistedJobs: {
          activeTotal: 1,
          staleTotal: 1,
          byType: {
            AI_CLEANING: { queued: 1, processing: 0, stale: 1 },
            PAGE_COUNT: { queued: 0, processing: 0, stale: 0 },
            PDF_GENERATION: { queued: 0, processing: 0, stale: 0 },
          },
        },
      }),
    };
    const runtimeTelemetry = {
      getSnapshot: jest.fn().mockReturnValue({
        processStartedAt: "2026-03-10T10:00:00.000Z",
        bootstrapStartedAt: "2026-03-10T10:00:00.500Z",
        bootstrapCompletedAt: "2026-03-10T10:00:02.000Z",
        startupDurationMs: 1500,
        firstRequest: null,
      }),
    };

    const service = new HealthService(
      prisma as never,
      redisService as never,
      scanner as never,
      rollout as never,
      queueAdmin as never,
      runtimeTelemetry as never
    );

    const result = await service.detailedStatus();

    expect(result.status).toBe("degraded");
    expect(result.runtime.startupDurationMs).toBe(1500);
    expect(result.queues.status).toBe("degraded");
    expect(result.queues.aiFormatting.counts.waiting).toBe(1);
    expect(result.services.redis.status).toBe("ok");
  });

  it("returns lightweight runtime telemetry from ping()", async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    const redisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue("PONG"),
      }),
    };
    const scanner = {
      isAvailable: jest.fn(),
      getProviderName: jest.fn(),
    };
    const rollout = {
      getMonitoringSnapshot: jest.fn(),
    };
    const queueAdmin = {
      collectSummary: jest.fn(),
    };
    const runtimeTelemetry = {
      getSnapshot: jest.fn().mockReturnValue({
        processStartedAt: "2026-03-10T10:00:00.000Z",
        bootstrapStartedAt: "2026-03-10T10:00:00.500Z",
        bootstrapCompletedAt: "2026-03-10T10:00:02.000Z",
        startupDurationMs: 1500,
        firstRequest: null,
      }),
    };

    const service = new HealthService(
      prisma as never,
      redisService as never,
      scanner as never,
      rollout as never,
      queueAdmin as never,
      runtimeTelemetry as never
    );

    const result = await service.ping();

    expect(result.status).toBe("ok");
    expect(result.runtime.processStartedAt).toBe("2026-03-10T10:00:00.000Z");
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
  });

  it("sends Basic auth headers to Gotenberg when credentials are configured", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GOTENBERG_URL = "http://gotenberg:3000";
    process.env.GOTENBERG_USERNAME = "admin";
    process.env.GOTENBERG_PASSWORD = "secret";

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
    } as Response);

    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    const redisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue("PONG"),
      }),
    };
    const scanner = {
      isAvailable: jest.fn().mockResolvedValue(true),
      getProviderName: jest.fn().mockReturnValue("clamav"),
    };
    const rollout = {
      getMonitoringSnapshot: jest.fn().mockReturnValue({
        environment: "development",
        allowInFlightAccess: true,
        features: {
          bookWorkspace: true,
          manuscriptPipeline: true,
          billingGate: true,
          finalPdf: true,
        },
      }),
    };
    const queueAdmin = {
      collectSummary: jest.fn().mockResolvedValue({
        status: "ok",
        provider: "bullmq",
        connectionSource: "env",
        aiFormatting: {
          status: "ok",
          queueName: "ai-formatting",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pageCount: {
          status: "ok",
          queueName: "page-count",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pdfGeneration: {
          status: "ok",
          queueName: "pdf-generation",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        persistedJobs: { activeTotal: 0, staleTotal: 0, byType: {} },
      }),
    };
    const runtimeTelemetry = {
      getSnapshot: jest.fn().mockReturnValue({
        processStartedAt: "2026-03-10T10:00:00.000Z",
        bootstrapStartedAt: null,
        bootstrapCompletedAt: null,
        startupDurationMs: null,
        firstRequest: null,
      }),
    };

    const service = new HealthService(
      prisma as never,
      redisService as never,
      scanner as never,
      rollout as never,
      queueAdmin as never,
      runtimeTelemetry as never
    );

    await service.detailedStatus();

    const expectedToken = Buffer.from("admin:secret", "utf-8").toString("base64");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://gotenberg:3000/health",
      expect.objectContaining({
        headers: { Authorization: `Basic ${expectedToken}` },
      })
    );
  });

  it("sends no auth headers to Gotenberg when credentials are not set", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GOTENBERG_URL = "http://gotenberg:3000";
    delete process.env.GOTENBERG_USERNAME;
    delete process.env.GOTENBERG_PASSWORD;

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
    } as Response);

    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    const redisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue("PONG"),
      }),
    };
    const scanner = {
      isAvailable: jest.fn().mockResolvedValue(true),
      getProviderName: jest.fn().mockReturnValue("clamav"),
    };
    const rollout = {
      getMonitoringSnapshot: jest.fn().mockReturnValue({
        environment: "development",
        allowInFlightAccess: true,
        features: {
          bookWorkspace: true,
          manuscriptPipeline: true,
          billingGate: true,
          finalPdf: true,
        },
      }),
    };
    const queueAdmin = {
      collectSummary: jest.fn().mockResolvedValue({
        status: "ok",
        provider: "bullmq",
        connectionSource: "env",
        aiFormatting: {
          status: "ok",
          queueName: "ai-formatting",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pageCount: {
          status: "ok",
          queueName: "page-count",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        pdfGeneration: {
          status: "ok",
          queueName: "pdf-generation",
          latencyMs: 1,
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            prioritized: 0,
            waitingChildren: 0,
          },
        },
        persistedJobs: { activeTotal: 0, staleTotal: 0, byType: {} },
      }),
    };
    const runtimeTelemetry = {
      getSnapshot: jest.fn().mockReturnValue({
        processStartedAt: "2026-03-10T10:00:00.000Z",
        bootstrapStartedAt: null,
        bootstrapCompletedAt: null,
        startupDurationMs: null,
        firstRequest: null,
      }),
    };

    const service = new HealthService(
      prisma as never,
      redisService as never,
      scanner as never,
      rollout as never,
      queueAdmin as never,
      runtimeTelemetry as never
    );

    await service.detailedStatus();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://gotenberg:3000/health",
      expect.objectContaining({
        headers: {},
      })
    );
  });
});
