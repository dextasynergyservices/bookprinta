import { ConflictException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { type JobStatus, type JobType } from "../generated/prisma/enums.js";
import { resolveBullMqConnection } from "../jobs/bullmq-connection.js";
import {
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";

type QueueHealthStatus = "ok" | "degraded" | "error";
type QueueMetricKey = "aiFormatting" | "pageCount" | "pdfGeneration";
type QueueJobType = "AI_CLEANING" | "PAGE_COUNT" | "PDF_GENERATION";

type QueueCountSnapshot = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  prioritized: number;
  waitingChildren: number;
};

type QueueMetric = {
  status: "ok" | "error";
  queueName: string;
  latencyMs: number;
  counts: QueueCountSnapshot;
  error?: string;
  lastFailedReason?: string;
};

type PersistedJobBucket = {
  queued: number;
  processing: number;
  stale: number;
};

type PersistedJobsSummary = {
  activeTotal: number;
  staleTotal: number;
  byType: Record<QueueJobType, PersistedJobBucket>;
};

export type QueueHealthSummary = {
  status: QueueHealthStatus;
  provider: "bullmq";
  connectionSource: "env" | "localhost_fallback";
  aiFormatting: QueueMetric;
  pageCount: QueueMetric;
  pdfGeneration: QueueMetric;
  persistedJobs: PersistedJobsSummary;
};

export type DevQueueResetResponse = {
  environment: "development" | "test";
  cleared: true;
  connectionSource: "env" | "localhost_fallback";
  databaseJobsFailed: number;
  queues: QueueHealthSummary;
};

type QueueClientMap = Record<QueueMetricKey, Queue>;

const ACTIVE_PERSISTED_JOB_STATUSES: JobStatus[] = ["QUEUED", "PROCESSING"];
const PIPELINE_JOB_TYPES: QueueJobType[] = ["AI_CLEANING", "PAGE_COUNT", "PDF_GENERATION"];
const STALE_AFTER_MS = 15 * 60 * 1000;
const QUEUE_TIMEOUT_MS = 5000;

const EMPTY_COUNTS: QueueCountSnapshot = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  prioritized: 0,
  waitingChildren: 0,
};

const QUEUE_DEFINITIONS: Array<{ key: QueueMetricKey; queueName: string; jobType: QueueJobType }> =
  [
    {
      key: "aiFormatting",
      queueName: QUEUE_AI_FORMATTING,
      jobType: "AI_CLEANING",
    },
    {
      key: "pageCount",
      queueName: QUEUE_PAGE_COUNT,
      jobType: "PAGE_COUNT",
    },
    {
      key: "pdfGeneration",
      queueName: QUEUE_PDF_GENERATION,
      jobType: "PDF_GENERATION",
    },
  ];

@Injectable()
export class QueueAdminService {
  private readonly logger = new Logger(QueueAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rollout: RolloutService
  ) {}

  async collectSummary(): Promise<QueueHealthSummary> {
    const connection = resolveBullMqConnection();
    const queues = this.createQueues();

    try {
      const [aiFormatting, pageCount, pdfGeneration, persistedJobs] = await Promise.all([
        this.collectQueueMetric(queues.aiFormatting, QUEUE_AI_FORMATTING),
        this.collectQueueMetric(queues.pageCount, QUEUE_PAGE_COUNT),
        this.collectQueueMetric(queues.pdfGeneration, QUEUE_PDF_GENERATION),
        this.collectPersistedJobsSummary(),
      ]);

      const hasQueueErrors = [aiFormatting, pageCount, pdfGeneration].some(
        (queue) => queue.status === "error"
      );

      return {
        status: hasQueueErrors || persistedJobs.staleTotal > 0 ? "degraded" : "ok",
        provider: "bullmq",
        connectionSource: connection.source,
        aiFormatting,
        pageCount,
        pdfGeneration,
        persistedJobs,
      };
    } finally {
      await this.closeQueues(queues);
    }
  }

  async resetDevelopmentQueues(): Promise<DevQueueResetResponse> {
    const environment = this.rollout.getEnvironment();
    if (environment !== "development" && environment !== "test") {
      throw new ForbiddenException(
        "Queue cleanup is only available in development and test environments."
      );
    }

    const connection = resolveBullMqConnection();
    const queues = this.createQueues();

    try {
      await Promise.all([
        queues.aiFormatting.pause(),
        queues.pageCount.pause(),
        queues.pdfGeneration.pause(),
      ]);

      const before = await Promise.all(
        QUEUE_DEFINITIONS.map(async ({ key, queueName }) => ({
          key,
          queueName,
          counts: await this.getQueueCounts(queues[key]),
        }))
      );

      const blockedQueues = before.filter((entry) => entry.counts.active > 0);
      if (blockedQueues.length > 0) {
        throw new ConflictException(
          `Cannot clear BullMQ queues while jobs are active: ${blockedQueues
            .map((entry) => `${entry.queueName}(${entry.counts.active})`)
            .join(", ")}. Restart the API worker or wait for active jobs to finish first.`
        );
      }

      await Promise.all([
        queues.aiFormatting.obliterate({ force: false }),
        queues.pageCount.obliterate({ force: false }),
        queues.pdfGeneration.obliterate({ force: false }),
      ]);

      const databaseJobsFailed = await this.markPersistedPipelineJobsFailed(
        "Cleared by local development queue reset."
      );

      const refreshedSummary = await this.collectSummary();

      return {
        environment,
        cleared: true,
        connectionSource: connection.source,
        databaseJobsFailed,
        queues: refreshedSummary,
      };
    } finally {
      await Promise.allSettled([
        queues.aiFormatting.resume(),
        queues.pageCount.resume(),
        queues.pdfGeneration.resume(),
      ]);
      await this.closeQueues(queues);
    }
  }

  private createQueues(): QueueClientMap {
    const { connection } = resolveBullMqConnection();

    return {
      aiFormatting: new Queue(QUEUE_AI_FORMATTING, { connection }),
      pageCount: new Queue(QUEUE_PAGE_COUNT, { connection }),
      pdfGeneration: new Queue(QUEUE_PDF_GENERATION, { connection }),
    };
  }

  private async closeQueues(queues: QueueClientMap): Promise<void> {
    await Promise.allSettled([
      queues.aiFormatting.close(),
      queues.pageCount.close(),
      queues.pdfGeneration.close(),
    ]);
  }

  private async collectQueueMetric(queue: Queue, queueName: string): Promise<QueueMetric> {
    const startedAt = Date.now();

    try {
      const counts = await this.getQueueCounts(queue);

      // If there are failed jobs, fetch the most recent one's error for diagnostics
      let lastFailedReason: string | undefined;
      if (counts.failed > 0) {
        try {
          const failedJobs = await this.withTimeout(
            queue.getFailed(0, 0),
            QUEUE_TIMEOUT_MS,
            `Queue ${queue.name} failed jobs`
          );
          const lastFailed = failedJobs?.[0];
          if (lastFailed?.failedReason) {
            lastFailedReason = lastFailed.failedReason.slice(0, 500);
          }
        } catch {
          // Non-critical — skip if we can't fetch failed job details
        }
      }

      return {
        status: "ok",
        queueName,
        latencyMs: Date.now() - startedAt,
        counts,
        ...(lastFailedReason ? { lastFailedReason } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Queue health check failed for ${queueName}`, error);

      return {
        status: "error",
        queueName,
        latencyMs: Date.now() - startedAt,
        counts: { ...EMPTY_COUNTS },
        error: message,
      };
    }
  }

  private async getQueueCounts(queue: Queue): Promise<QueueCountSnapshot> {
    const [waiting, active, delayed, failed, completed, prioritized, waitingChildren] =
      await this.withTimeout(
        Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getDelayedCount(),
          queue.getFailedCount(),
          queue.getCompletedCount(),
          queue.getPrioritizedCount(),
          queue.getWaitingChildrenCount(),
        ]),
        QUEUE_TIMEOUT_MS,
        `Queue ${queue.name} metrics`
      );

    return {
      waiting,
      active,
      delayed,
      failed,
      completed,
      prioritized,
      waitingChildren,
    };
  }

  private async collectPersistedJobsSummary(): Promise<PersistedJobsSummary> {
    const jobs = await this.prisma.job.findMany({
      where: {
        type: { in: PIPELINE_JOB_TYPES },
        status: { in: ACTIVE_PERSISTED_JOB_STATUSES },
      },
      select: {
        type: true,
        status: true,
        createdAt: true,
        startedAt: true,
      },
    });

    const summary: PersistedJobsSummary = {
      activeTotal: jobs.length,
      staleTotal: 0,
      byType: {
        AI_CLEANING: { queued: 0, processing: 0, stale: 0 },
        PAGE_COUNT: { queued: 0, processing: 0, stale: 0 },
        PDF_GENERATION: { queued: 0, processing: 0, stale: 0 },
      },
    };

    for (const job of jobs) {
      const type = job.type as QueueJobType;
      if (!summary.byType[type]) continue;

      if (job.status === "QUEUED") {
        summary.byType[type].queued += 1;
      } else if (job.status === "PROCESSING") {
        summary.byType[type].processing += 1;
      }

      if (this.isStalePersistedJob(job)) {
        summary.byType[type].stale += 1;
        summary.staleTotal += 1;
      }
    }

    return summary;
  }

  private isStalePersistedJob(job: {
    status: JobStatus;
    createdAt: Date;
    startedAt: Date | null;
  }): boolean {
    const reference =
      job.status === "PROCESSING" ? (job.startedAt ?? job.createdAt) : job.createdAt;
    return Date.now() - reference.getTime() > STALE_AFTER_MS;
  }

  private async markPersistedPipelineJobsFailed(error: string): Promise<number> {
    const result = await this.prisma.job.updateMany({
      where: {
        type: { in: PIPELINE_JOB_TYPES as JobType[] },
        status: { in: ACTIVE_PERSISTED_JOB_STATUSES },
      },
      data: {
        status: "FAILED",
        error,
        startedAt: null,
        finishedAt: new Date(),
      },
    });

    return result.count;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  }
}
