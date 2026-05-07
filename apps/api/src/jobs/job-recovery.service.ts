import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { JobType } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import {
  JOB_NAMES,
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "./jobs.constants.js";

/**
 * Poll for PENDING_REDIS jobs every 30 seconds once Redis comes back.
 * Keep the batch small (20) so one recovery cycle doesn't block the event loop.
 */
const RECOVERY_INTERVAL_MS = 30_000;

/**
 * Expire jobs that have been PENDING_REDIS for more than 30 minutes.
 * At that point the pipeline state is stale (e.g. user may have re-uploaded).
 * The user will need to re-trigger the job (e.g. re-upload or re-approve).
 */
const PENDING_REDIS_STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Minimal duplicate-job check — matches BullMQ's thrown message when a jobId
 * already exists. Mirrors the private isDuplicateQueueJobError in BooksPipelineService.
 */
function isDuplicateJobError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("jobid") && msg.includes("exists");
}

/**
 * JobRecoveryService — Fix 2.1: Redis SPOF mitigation.
 *
 * When BullMQ's queue.add() throws a Redis connection error, BooksPipelineService
 * sets the DB Job status to PENDING_REDIS instead of FAILED. This service polls
 * for those parked jobs every 30 seconds and re-enqueues them as soon as Redis
 * is available again, covering brief Upstash flaps without losing work.
 *
 * Recovery flow:
 *  1. setInterval fires every 30s
 *  2. Check RedisService.isAvailable() — skip if Redis is still down
 *  3. Fetch up to 20 PENDING_REDIS jobs (oldest first)
 *  4. For each: expire stale jobs (> 30 min old), otherwise re-enqueue
 *  5. On success → set status to QUEUED; on duplicate → also set QUEUED;
 *     on any other error → leave as PENDING_REDIS for the next cycle
 *
 * Both PrismaModule and RedisModule are @Global(), so no extra imports needed.
 */
@Injectable()
export class JobRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobRecoveryService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_AI_FORMATTING) private readonly aiFormattingQueue: Queue,
    @InjectQueue(QUEUE_PAGE_COUNT) private readonly pageCountQueue: Queue,
    @InjectQueue(QUEUE_PDF_GENERATION) private readonly pdfGenerationQueue: Queue
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.recoverPendingRedisJobs();
    }, RECOVERY_INTERVAL_MS);

    this.logger.log(
      `Job recovery loop started — polling every ${RECOVERY_INTERVAL_MS / 1_000}s for PENDING_REDIS jobs`
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Main recovery loop. Called every RECOVERY_INTERVAL_MS.
   * Public so it can be triggered manually in tests.
   */
  async recoverPendingRedisJobs(): Promise<void> {
    if (!this.redisService.isAvailable()) return;

    const pending = await this.prisma.job.findMany({
      where: { status: "PENDING_REDIS" },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true, type: true, payload: true, createdAt: true },
    });

    if (pending.length === 0) return;

    this.logger.log(`Recovering ${pending.length} PENDING_REDIS job(s) now that Redis is back`);

    const staleThreshold = new Date(Date.now() - PENDING_REDIS_STALE_AFTER_MS);

    for (const job of pending) {
      if (job.createdAt < staleThreshold) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: "Expired while waiting for Redis to recover. Re-upload or re-approve to retry.",
            finishedAt: new Date(),
          },
        });
        this.logger.warn(
          `Expired stale PENDING_REDIS job ${job.id} ` +
            `(type=${job.type}, age=${Math.round((Date.now() - job.createdAt.getTime()) / 60_000)}min)`
        );
        continue;
      }

      await this.recoverOne(job);
    }
  }

  private async recoverOne(job: { id: string; type: JobType; payload: unknown }): Promise<void> {
    const queue = this.getQueue(job.type);
    if (!queue) {
      this.logger.warn(`No queue registered for job type "${job.type}" — skipping recovery`);
      return;
    }

    const payload =
      typeof job.payload === "object" && job.payload !== null
        ? (job.payload as Record<string, unknown>)
        : {};

    // queueJobId was stored in the payload when the job was originally created
    // (added by BooksPipelineService as part of Fix 2.1). Older jobs without it
    // will get a new BullMQ-generated ID, losing deduplication but still enqueuing.
    const queueJobId = typeof payload.queueJobId === "string" ? payload.queueJobId : undefined;

    try {
      await queue.add(
        this.getJobName(job.type),
        { jobRecordId: job.id, ...payload },
        { jobId: queueJobId, ...this.getJobOptions(job.type) }
      );

      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "QUEUED" },
      });

      this.logger.log(
        `Recovered job ${job.id} → QUEUED (type=${job.type}, queueJobId=${queueJobId ?? "auto"})`
      );
    } catch (error: unknown) {
      // Job already in queue (race condition or partial Redis recovery).
      // Treat as a success — it will be processed.
      if (isDuplicateJobError(error)) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: "QUEUED" },
        });
        this.logger.log(`PENDING_REDIS job ${job.id} already in queue — marking QUEUED`);
        return;
      }

      // Redis likely still unavailable — leave as PENDING_REDIS for the next cycle.
      this.logger.warn(
        `Could not recover job ${job.id} (type=${job.type}) — Redis may still be unavailable: ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  private getQueue(type: JobType): Queue | null {
    if (type === "AI_CLEANING") return this.aiFormattingQueue;
    if (type === "PAGE_COUNT") return this.pageCountQueue;
    if (type === "PDF_GENERATION") return this.pdfGenerationQueue;
    return null;
  }

  private getJobName(type: JobType): string {
    if (type === "AI_CLEANING") return JOB_NAMES.FORMAT_MANUSCRIPT;
    if (type === "PAGE_COUNT") return JOB_NAMES.COUNT_PAGES;
    if (type === "PDF_GENERATION") return JOB_NAMES.GENERATE_PDF;
    return type;
  }

  private getJobOptions(type: JobType): {
    attempts: number;
    backoff: { type: "exponential"; delay: number };
  } {
    if (type === "AI_CLEANING")
      return { attempts: 3, backoff: { type: "exponential", delay: 10_000 } };
    if (type === "PAGE_COUNT")
      return { attempts: 3, backoff: { type: "exponential", delay: 5_000 } };
    // PDF_GENERATION
    return { attempts: 3, backoff: { type: "exponential", delay: 10_000 } };
  }
}
