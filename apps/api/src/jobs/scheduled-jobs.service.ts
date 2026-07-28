import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { RedisService } from "../redis/redis.service.js";
import { JOB_NAMES, LEGACY_MAINTENANCE_QUEUES, QUEUE_MAINTENANCE } from "./jobs.constants.js";

export type TriggerSource = "cron" | "admin" | "manual";

export type TriggerResult = {
  queued: boolean;
  jobId: string | null;
  queue: string;
  /** Set when the job was not queued because an identical run is already pending. */
  reason?: string;
};

/**
 * ScheduledJobsService — replaces BullMQ job schedulers with on-demand triggers.
 *
 * ─── Why ──────────────────────────────────────────────────────────────────
 *
 * We previously used `Queue.upsertJobScheduler()` for the production-delay
 * monitor (every 15 min) and the audit-log archiver (every 24 h). A job
 * scheduler keeps a *delayed* job permanently pending on its queue, and BullMQ
 * clamps a worker's blocking poll to `maximumBlockTimeout` = 10 seconds whenever
 * a delayed job exists (worker.js:470-484) — `drainDelay` is ignored.
 *
 * The measured result: those two queues alone consumed ~1,000,000 Redis commands
 * per month, to run jobs that fire 96 times and once per day respectively. That
 * was ~70% of total consumption and the single largest cost in the system.
 *
 * See docs/infra-cost-hardening-plan.md, Phase 1b.
 *
 * ─── How ──────────────────────────────────────────────────────────────────
 *
 * External cron (the account already pinging `/health/ping`) POSTs to the
 * endpoints in `CronController`, which call the trigger methods here. Those
 * enqueue an ordinary immediate job — no delayed job, so no 10-second clamp.
 * Workers are still woken instantly by the queue marker on `add()`.
 *
 * The processors, retry policy, and queue observability are all unchanged; only
 * the *scheduling mechanism* moved.
 *
 * Trade-off: schedule definitions now live outside the codebase, so they must be
 * documented in the runbook and recreated per environment. Accepted because it is
 * the only option that stays correct under horizontal scaling — an in-process
 * timer would fire once per instance.
 */
@Injectable()
export class ScheduledJobsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    @InjectQueue(QUEUE_MAINTENANCE)
    private readonly maintenanceQueue: Queue,
    private readonly redis: RedisService
  ) {}

  /**
   * Boot-time cleanup of Redis state left by earlier deployments.
   *
   * The LEGACY per-job maintenance queues (`production-delay`,
   * `audit-log-archiver`) no longer have workers after the Phase 4 merge. We
   * delete all of their Redis keys outright — jobs, schedulers, meta, everything.
   * A registered job scheduler lives in Redis, not in code, so deleting the code
   * that created it does NOT stop it; wiping the keys does. This is load-bearing:
   * a surviving scheduler would keep creating delayed jobs and polling.
   *
   * Direct key deletion (rather than constructing a BullMQ Queue and calling
   * `obliterate`) is deliberate: a Queue client re-writes its own `:meta` and
   * `:stalled-check` keys on construction, so it would leave residue every boot.
   * Raw SCAN + UNLINK leaves nothing behind. Idempotent and safe on every boot.
   */
  async onModuleInit(): Promise<void> {
    const client = this.redis.getClient();
    if (!client) {
      // Redis unavailable at boot — non-fatal. Nothing consumes the legacy
      // queues, so leftover keys (if any) are inert; retried next boot.
      return;
    }

    for (const name of LEGACY_MAINTENANCE_QUEUES) {
      try {
        const deleted = await this.deleteKeysByPattern(client, `bull:${name}:*`);
        if (deleted > 0) {
          this.logger.warn(
            `Purged ${deleted} residual Redis key(s) from legacy maintenance queue "${name}" (Phase 4 cutover)`
          );
        }
      } catch (error) {
        this.logger.warn(
          `Could not purge legacy queue "${name}": ` +
            `${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * SCAN + UNLINK all keys matching a pattern. SCAN (not KEYS) avoids blocking
   * Redis; UNLINK (not DEL) frees memory off the main thread. Deletes in batches.
   */
  private async deleteKeysByPattern(
    client: NonNullable<ReturnType<RedisService["getClient"]>>,
    pattern: string
  ): Promise<number> {
    let cursor = "0";
    let deleted = 0;

    do {
      const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) {
        await client.unlink(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    return deleted;
  }

  /**
   * Enqueue an immediate production-delay backlog check onto the unified
   * maintenance queue. Called by external cron at its 15-minute cadence.
   */
  async triggerProductionDelayCheck(source: TriggerSource): Promise<TriggerResult> {
    return this.enqueue(JOB_NAMES.CHECK_PRODUCTION_DELAY, source, { count: 24 }, { count: 48 });
  }

  /** Enqueue an immediate audit-log archive run onto the unified maintenance queue. */
  async triggerAuditLogArchive(source: TriggerSource): Promise<TriggerResult> {
    return this.enqueue(JOB_NAMES.ARCHIVE_AUDIT_LOGS, source, { count: 7 }, { count: 14 });
  }

  private async enqueue(
    jobName: string,
    source: TriggerSource,
    removeOnComplete: { count: number },
    removeOnFail: { count: number }
  ): Promise<TriggerResult> {
    const queue = this.maintenanceQueue;

    // Guard against a double-firing cron or overlapping manual+cron runs: skip if
    // a run of THIS job is already pending. Two job types now share one queue, so
    // we must filter by job name — a per-queue count would let a pending
    // production-delay check wrongly block an audit-archive trigger, and vice versa.
    const inFlight = await queue.getJobs(["wait", "active", "delayed"]);
    const alreadyPending = inFlight.some((job) => job.name === jobName);

    if (alreadyPending) {
      this.logger.log(
        `Skipping "${jobName}" trigger from ${source} — a run is already pending on "${queue.name}"`
      );
      return {
        queued: false,
        jobId: null,
        queue: queue.name,
        reason: "A run is already queued or in progress",
      };
    }

    const job = await queue.add(
      jobName,
      { source },
      { attempts: 1, removeOnComplete, removeOnFail }
    );

    this.logger.log(`Queued "${jobName}" (job ${job.id}) on "${queue.name}" from ${source}`);

    return { queued: true, jobId: job.id ?? null, queue: queue.name };
  }
}
