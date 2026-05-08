import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { JobType } from "bullmq";
import { Queue } from "bullmq";
import { resolveBullMqConnection } from "../jobs/bullmq-connection.js";
import { ALL_QUEUES } from "../jobs/jobs.constants.js";

// ──────────────────────────────────────────────────────────────────────
// Type definitions for queue stats
// ──────────────────────────────────────────────────────────────────────

export type QueueCountsRecord = {
  /** BullMQ queue name (e.g. "ai-formatting") */
  name: string;
  /** Jobs waiting to be picked up by a worker */
  waiting: number;
  /** Jobs currently being processed */
  active: number;
  /** Jobs that have failed all retry attempts */
  failed: number;
  /** Recently completed jobs (BullMQ trims this list by default) */
  completed: number;
  /** Jobs scheduled for future execution (delayed/retry backoff) */
  delayed: number;
  /** Jobs paused by a manual queue.pause() call */
  paused: number;
};

export type QueueStatsResult = {
  /** Per-queue job counts */
  queues: QueueCountsRecord[];
  /** ISO-8601 timestamp of when the snapshot was taken */
  timestamp: string;
  /**
   * Whether Redis responded successfully.
   * When false, all counts are -1 (Redis is unavailable or timed out).
   */
  redisAvailable: boolean;
};

// ──────────────────────────────────────────────────────────────────────
// Job detail types — returned by getQueueJobs()
// ──────────────────────────────────────────────────────────────────────

export type QueueJobDetailItem = {
  id: string;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  stacktrace: string[];
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  delay: number;
  progress: string;
  data: string;
};

export type QueueJobsResult = {
  jobs: QueueJobDetailItem[];
  total: number;
  page: number;
  limit: number;
};

// ──────────────────────────────────────────────────────────────────────
// Sentinel values written when Redis is unavailable
// ──────────────────────────────────────────────────────────────────────
const UNAVAILABLE_COUNTS: Omit<QueueCountsRecord, "name"> = {
  waiting: -1,
  active: -1,
  failed: -1,
  completed: -1,
  delayed: -1,
  paused: -1,
};

// ──────────────────────────────────────────────────────────────────────
// AdminQueueStatsService
//
// Creates one lightweight BullMQ Queue instance per queue name solely
// for observability (getJobCounts is a pure Redis read). These instances
// are NOT the worker queues registered in JobsModule — they share the
// same Redis keyspace but are independent client objects.
//
// Isolation rationale: Injecting the JobsModule queue instances here
// would create a circular dependency chain
//   JobsModule → ProductionDelayModule → JobsModule.
// Creating dedicated metrics-only Queue objects avoids that entirely
// with negligible overhead (two ioredis connections per Queue, closed
// on module destroy).
// ──────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminQueueStatsService implements OnModuleDestroy {
  private readonly logger = new Logger(AdminQueueStatsService.name);

  /** Metrics-only Queue instances keyed by queue name. */
  private readonly queueMap: Map<string, Queue>;

  constructor() {
    const { connection } = resolveBullMqConnection();
    this.queueMap = new Map(ALL_QUEUES.map((name) => [name, new Queue(name, { connection })]));
  }

  /**
   * Returns a snapshot of job counts for every registered queue.
   *
   * On Redis failure the counts are set to -1 and `redisAvailable: false`
   * so callers can surface a degraded-state warning without crashing.
   */
  async getQueueStats(): Promise<QueueStatsResult> {
    try {
      const queues = await Promise.all(
        [...this.queueMap.values()].map(async (queue): Promise<QueueCountsRecord> => {
          const counts = await queue.getJobCounts(
            "waiting",
            "active",
            "failed",
            "completed",
            "delayed",
            "paused"
          );
          return {
            name: queue.name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            failed: counts.failed ?? 0,
            completed: counts.completed ?? 0,
            delayed: counts.delayed ?? 0,
            paused: counts.paused ?? 0,
          };
        })
      );

      return {
        queues,
        timestamp: new Date().toISOString(),
        redisAvailable: true,
      };
    } catch (error) {
      this.logger.warn("Failed to fetch queue stats from Redis", error);

      return {
        queues: ALL_QUEUES.map((name) => ({ name, ...UNAVAILABLE_COUNTS })),
        timestamp: new Date().toISOString(),
        redisAvailable: false,
      };
    }
  }

  /**
   * Returns a paginated list of job detail records for a specific queue + state.
   *
   * Returns `{ jobs: [], total: 0 }` when the queue name is unknown or Redis
   * is unavailable — callers should not treat an empty result as an error.
   */
  async getQueueJobs(
    queueName: string,
    state: string,
    page: number,
    limit: number
  ): Promise<QueueJobsResult> {
    const VALID_STATES: JobType[] = [
      "waiting",
      "active",
      "failed",
      "completed",
      "delayed",
      "paused",
    ];

    const queue = this.queueMap.get(queueName);
    if (!queue || !VALID_STATES.includes(state as JobType)) {
      return { jobs: [], total: 0, page, limit };
    }

    try {
      const start = page * limit;
      const end = start + limit - 1;

      const [rawJobs, counts] = await Promise.all([
        queue.getJobs([state as JobType], start, end),
        queue.getJobCounts(...VALID_STATES),
      ]);

      const total = (counts as Record<string, number>)[state] ?? 0;

      const jobs: QueueJobDetailItem[] = rawJobs.map((job) => ({
        id: String(job.id ?? "unknown"),
        name: job.name,
        attemptsMade: job.attemptsMade ?? 0,
        failedReason: job.failedReason ?? null,
        stacktrace: Array.isArray(job.stacktrace) ? (job.stacktrace as string[]) : [],
        timestamp: job.timestamp ?? Date.now(),
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        delay: job.opts?.delay ?? 0,
        progress: this.serializeProgress(job.progress),
        data: this.sanitizeJobData(job.data),
      }));

      return { jobs, total, page, limit };
    } catch (error) {
      this.logger.warn(`Failed to fetch ${state} jobs for queue "${queueName}"`, error);
      return { jobs: [], total: 0, page, limit };
    }
  }

  /** Close all metrics-only Queue connections on application shutdown. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queueMap.values()].map((q) => q.close()));
    this.logger.debug("Queue stats connections closed");
  }

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  private serializeProgress(progress: unknown): string {
    if (progress === null || progress === undefined) return "0";
    if (typeof progress === "number" || typeof progress === "string") return String(progress);
    try {
      return JSON.stringify(progress).slice(0, 200);
    } catch {
      return "0";
    }
  }

  /**
   * JSON-serialises the job payload and truncates to a safe display length.
   * Redacts top-level keys that look like secrets (password, token, secret, key).
   */
  private sanitizeJobData(data: unknown): string {
    const SENSITIVE_KEYS = new Set(["password", "token", "secret", "apiKey", "api_key"]);

    let sanitized: unknown = data;

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const clone: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        clone[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : value;
      }
      sanitized = clone;
    }

    try {
      const json = JSON.stringify(sanitized, null, 2);
      if (json.length > 5_000) {
        return `${json.slice(0, 5_000)}\n... (truncated)`;
      }
      return json;
    } catch {
      return "(unable to serialize job payload)";
    }
  }
}
