import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { PendingRedisSignal } from "../common/pending-redis-signal.js";
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
 * How often the recovery timer ticks. A tick only touches the DB when there is
 * plausibly work — see shouldSweep(). Keep batches small (20) so one cycle
 * doesn't block the event loop.
 */
const RECOVERY_INTERVAL_MS = 30_000;

/**
 * Safety sweep interval (Phase 6). Even when no park has been signalled in this
 * process, query the DB this often so jobs parked by a previous process or
 * another instance are still recovered. 15 min → ~96 queries/day vs the old
 * ~2,880, while remaining robust to a missed signal or horizontal scaling.
 */
const SAFETY_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

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
  private lastSweepAtMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly pendingRedisSignal: PendingRedisSignal,
    @InjectQueue(QUEUE_AI_FORMATTING) private readonly aiFormattingQueue: Queue,
    @InjectQueue(QUEUE_PAGE_COUNT) private readonly pageCountQueue: Queue,
    @InjectQueue(QUEUE_PDF_GENERATION) private readonly pdfGenerationQueue: Queue
  ) {}

  onModuleInit(): void {
    // Boot reconciliation: a previous process may have parked jobs before
    // restart, so prime the signal from the DB exactly once. If any are found,
    // the timer will recover them on its next tick.
    void this.reconcileOnBoot();

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, RECOVERY_INTERVAL_MS);

    this.logger.log(
      `Job recovery loop started — idle unless a job is parked; safety sweep every ${
        SAFETY_SWEEP_INTERVAL_MS / 60_000
      }min`
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Timer tick. Skips the DB entirely unless a park was signalled or the safety
   * sweep is due — this is what turns ~2,880 idle queries/day into ~96 (Phase 6).
   */
  private async tick(): Promise<void> {
    if (!this.shouldSweep()) return;
    await this.recoverPendingRedisJobs();
  }

  /**
   * Query the DB when EITHER a park has been signalled in this process, OR it
   * has been at least SAFETY_SWEEP_INTERVAL_MS since the last sweep (covers jobs
   * parked by another process/instance, or a signal we somehow missed).
   */
  private shouldSweep(): boolean {
    if (this.pendingRedisSignal.isPending()) return true;
    return Date.now() - this.lastSweepAtMs >= SAFETY_SWEEP_INTERVAL_MS;
  }

  private async reconcileOnBoot(): Promise<void> {
    try {
      const parked = await this.prisma.job.count({ where: { status: "PENDING_REDIS" } });
      if (parked > 0) {
        this.pendingRedisSignal.markPending();
        this.logger.log(`Boot reconciliation found ${parked} PENDING_REDIS job(s) to recover`);
      }
    } catch (error) {
      this.logger.warn(
        `Boot reconciliation query failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Main recovery loop. Public so it can be triggered manually in tests.
   * Records the sweep time and clears the signal when no parked jobs remain.
   */
  async recoverPendingRedisJobs(): Promise<void> {
    // Redis still down — nothing to recover onto. Leave the signal set so we
    // retry on the next tick; do NOT count this as a completed sweep.
    if (!this.redisService.isAvailable()) return;

    this.lastSweepAtMs = Date.now();

    const pending = await this.prisma.job.findMany({
      where: { status: "PENDING_REDIS" },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true, type: true, payload: true, createdAt: true },
    });

    if (pending.length === 0) {
      // Queue drained (or nothing was parked) — go back to sleep until the next
      // signal or safety sweep.
      this.pendingRedisSignal.clear();
      return;
    }

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
