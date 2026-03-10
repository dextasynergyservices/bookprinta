/// <reference types="jest" />
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RolloutService } from "../rollout/rollout.service.js";
import { QueueAdminService } from "./queue-admin.service.js";

type FakeQueue = {
  pause: jest.Mock<Promise<void>, []>;
  resume: jest.Mock<Promise<void>, []>;
  close: jest.Mock<Promise<void>, []>;
  obliterate: jest.Mock<Promise<void>, [{ force: boolean }]>;
  getWaitingCount: jest.Mock<Promise<number>, []>;
  getActiveCount: jest.Mock<Promise<number>, []>;
  getDelayedCount: jest.Mock<Promise<number>, []>;
  getFailedCount: jest.Mock<Promise<number>, []>;
  getCompletedCount: jest.Mock<Promise<number>, []>;
  getPrioritizedCount: jest.Mock<Promise<number>, []>;
  getWaitingChildrenCount: jest.Mock<Promise<number>, []>;
};

describe("QueueAdminService", () => {
  let service: QueueAdminService;
  let prisma: {
    job: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let rollout: {
    getEnvironment: jest.Mock;
  };
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
    prisma = {
      job: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    rollout = {
      getEnvironment: jest.fn().mockReturnValue("development"),
    };

    service = new QueueAdminService(
      prisma as unknown as PrismaService,
      rollout as never as RolloutService
    );
  });

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
    jest.restoreAllMocks();
  });

  it("collects BullMQ queue counts and persisted job summary", async () => {
    prisma.job.findMany.mockResolvedValue([
      {
        type: "AI_CLEANING",
        status: "QUEUED",
        createdAt: new Date(),
        startedAt: null,
      },
    ]);

    jest.spyOn(service as never, "createQueues" as never).mockReturnValue(
      createQueueMap({
        aiFormatting: { waiting: 2, active: 0, completed: 3 },
        pageCount: { waiting: 0, active: 0, completed: 1 },
        pdfGeneration: { waiting: 0, active: 0, completed: 0 },
      }) as never
    );

    const summary = await service.collectSummary();

    expect(summary.status).toBe("ok");
    expect(summary.connectionSource).toBe("env");
    expect(summary.aiFormatting.counts.waiting).toBe(2);
    expect(summary.aiFormatting.counts.completed).toBe(3);
    expect(summary.persistedJobs.activeTotal).toBe(1);
    expect(summary.persistedJobs.byType.AI_CLEANING.queued).toBe(1);
  });

  it("rejects queue cleanup outside development and test", async () => {
    rollout.getEnvironment.mockReturnValue("production");

    await expect(service.resetDevelopmentQueues()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses queue cleanup when BullMQ still has active jobs", async () => {
    const queues = createQueueMap({
      aiFormatting: { waiting: 0, active: 1 },
      pageCount: { waiting: 0, active: 0 },
      pdfGeneration: { waiting: 0, active: 0 },
    });

    jest.spyOn(service as never, "createQueues" as never).mockReturnValue(queues as never);

    await expect(service.resetDevelopmentQueues()).rejects.toBeInstanceOf(ConflictException);
    expect(queues.aiFormatting.obliterate).not.toHaveBeenCalled();
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
    expect(queues.aiFormatting.resume).toHaveBeenCalled();
  });

  it("clears non-active queues and marks persisted pipeline jobs failed in development", async () => {
    const queues = createQueueMap({
      aiFormatting: { waiting: 3, active: 0, failed: 1 },
      pageCount: { waiting: 1, active: 0 },
      pdfGeneration: { waiting: 0, active: 0 },
    });

    jest.spyOn(service as never, "createQueues" as never).mockReturnValue(queues as never);
    jest.spyOn(service, "collectSummary").mockResolvedValue({
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
      persistedJobs: {
        activeTotal: 0,
        staleTotal: 0,
        byType: {
          AI_CLEANING: { queued: 0, processing: 0, stale: 0 },
          PAGE_COUNT: { queued: 0, processing: 0, stale: 0 },
          PDF_GENERATION: { queued: 0, processing: 0, stale: 0 },
        },
      },
    });
    prisma.job.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.resetDevelopmentQueues();

    expect(result.cleared).toBe(true);
    expect(result.databaseJobsFailed).toBe(2);
    expect(queues.aiFormatting.obliterate).toHaveBeenCalledWith({ force: false });
    expect(queues.pageCount.obliterate).toHaveBeenCalledWith({ force: false });
    expect(queues.pdfGeneration.obliterate).toHaveBeenCalledWith({ force: false });
    expect(prisma.job.updateMany).toHaveBeenCalled();
  });
});

function createQueueMap(input: {
  aiFormatting: Partial<Counts>;
  pageCount: Partial<Counts>;
  pdfGeneration: Partial<Counts>;
}): Record<"aiFormatting" | "pageCount" | "pdfGeneration", FakeQueue> {
  return {
    aiFormatting: createFakeQueue(input.aiFormatting),
    pageCount: createFakeQueue(input.pageCount),
    pdfGeneration: createFakeQueue(input.pdfGeneration),
  };
}

type Counts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  prioritized: number;
  waitingChildren: number;
};

function createFakeQueue(counts: Partial<Counts>): FakeQueue {
  return {
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    obliterate: jest.fn().mockResolvedValue(undefined),
    getWaitingCount: jest.fn().mockResolvedValue(counts.waiting ?? 0),
    getActiveCount: jest.fn().mockResolvedValue(counts.active ?? 0),
    getDelayedCount: jest.fn().mockResolvedValue(counts.delayed ?? 0),
    getFailedCount: jest.fn().mockResolvedValue(counts.failed ?? 0),
    getCompletedCount: jest.fn().mockResolvedValue(counts.completed ?? 0),
    getPrioritizedCount: jest.fn().mockResolvedValue(counts.prioritized ?? 0),
    getWaitingChildrenCount: jest.fn().mockResolvedValue(counts.waitingChildren ?? 0),
  };
}
