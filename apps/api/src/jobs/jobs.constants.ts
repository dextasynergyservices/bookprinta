/**
 * BullMQ Queue Names
 *
 * Book processing pipeline (CLAUDE.md Section 18.2) — one queue per stage,
 * strictly sequential at concurrency 1:
 *  - AI_FORMATTING: Gemini — manuscript → semantic HTML
 *  - PAGE_COUNT:    Gotenberg — HTML → authoritative page count + preview PDF
 *  - PDF_GENERATION: promotes the preview to the final print-ready PDF
 *
 * Maintenance (Phase 4, maintenance-only merge): a SINGLE queue carries both
 * periodic maintenance jobs, discriminated by job name. One worker instead of
 * two removes an idle Redis polling loop. These jobs are non-billing,
 * idempotent, and triggered by external cron (Phase 1b), so the two-queue →
 * one-queue cutover is safe in a single deploy — a job interrupted at deploy is
 * simply re-run on the next cron tick.
 */
export const QUEUE_AI_FORMATTING = "ai-formatting";
export const QUEUE_PDF_GENERATION = "pdf-generation";
export const QUEUE_PAGE_COUNT = "page-count";

/** Unified maintenance queue (production-delay monitor + audit-log archiver). */
export const QUEUE_MAINTENANCE = "bp-maintenance";

/**
 * Legacy per-job maintenance queue names. Retained ONLY so boot-time cleanup can
 * remove any residual jobs/schedulers left in Redis by the pre-merge deployment.
 * Nothing consumes these any more — do not enqueue to them.
 */
export const LEGACY_QUEUE_PRODUCTION_DELAY = "production-delay";
export const LEGACY_QUEUE_AUDIT_LOG_ARCHIVER = "audit-log-archiver";

/**
 * Cadence reference for the external cron (Phase 1b): production-delay every
 * 15 min, audit archive daily. Enforced by the cron provider, not by code —
 * kept here as documentation. See docs/runbook-scheduled-jobs.md.
 */

/** Hard-delete AuditLog rows older than this many days. */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/**
 * ─── Shared BullMQ worker tuning ──────────────────────────────────────────
 *
 * Single source of truth for worker polling behaviour, so the five processors
 * cannot drift apart. Values are measured, not guessed — see
 * docs/infra-cost-hardening-plan.md (Phases 0 and 1).
 *
 * MIND THE UNITS. BullMQ mixes them, and this has already caused one bug:
 *   - `drainDelay`      is in SECONDS
 *   - `stalledInterval` is in MILLISECONDS
 *   - `lockDuration`    is in MILLISECONDS
 *
 * The previous config set `drainDelay: 60_000` intending 60 seconds; BullMQ read
 * it as 60,000 seconds (~16.7 hours). It happened to be harmless — workers are
 * woken immediately by the queue marker when a job is added, so drainDelay only
 * governs the idle re-poll — but it was wrong by accident, so it is now explicit.
 */

/**
 * Seconds a worker long-polls an empty queue before re-issuing `bzpopmin`.
 *
 * 300s (vs BullMQ's 5s default) because job pickup does NOT depend on this:
 * `Queue.add()` writes the marker key that the blocking call watches, waking the
 * worker immediately. This is purely an idle safety net, so a long value costs
 * nothing in latency and ~26k Redis commands/month across the pipeline queues.
 *
 * NOTE: this has no effect on a queue that always has a delayed job pending
 * (i.e. any queue driven by a job scheduler). BullMQ clamps those to
 * `maximumBlockTimeout` = 10s regardless of drainDelay — see worker.js:470-484.
 * That clamp, not this value, is the dominant idle cost. See the plan's Phase 4.
 */
const WORKER_DRAIN_DELAY_SECONDS = 300;

/**
 * Milliseconds between stalled-job checks.
 *
 * 300_000 (vs BullMQ's 30_000 default) — a 10x reduction in the `evalsha` traffic
 * that dominated the Phase 0 baseline.
 *
 * Safe because every worker runs `concurrency: 1` and job state is independently
 * durable in the Postgres `Job` table. The only effect is that a job orphaned by a
 * hard worker crash returns to `wait` up to 5 minutes later instead of 30 seconds
 * later — on queues that process a handful of jobs per day.
 *
 * `maxStalledCount` is deliberately left at BullMQ's default of 1: a job that
 * stalls twice indicates a genuine problem (OOM on a large render, for instance)
 * and should fail loudly for admin review rather than loop.
 */
const WORKER_STALLED_INTERVAL_MS = 300_000;

/**
 * Worker options for the three pipeline queues (AI formatting, page count, PDF
 * generation). All are `concurrency: 1` — the pipeline is strictly sequential.
 */
export const PIPELINE_WORKER_OPTS = {
  concurrency: 1,
  drainDelay: WORKER_DRAIN_DELAY_SECONDS,
  stalledInterval: WORKER_STALLED_INTERVAL_MS,
} as const;

/**
 * Worker options for the unified maintenance queue.
 *
 * Since Phase 1b removed the job schedulers, this queue no longer holds a
 * permanently-pending delayed job, so — like the pipeline queues — it blocks at
 * `drainDelay` rather than the old 10s clamp. Identical to the pipeline options.
 */
export const MAINTENANCE_WORKER_OPTS = {
  concurrency: 1,
  drainDelay: WORKER_DRAIN_DELAY_SECONDS,
  stalledInterval: WORKER_STALLED_INTERVAL_MS,
} as const;

/**
 * Active queue names — used to register queues in BullModule and to drive the
 * admin queue-health panel. Post Phase 4 (maintenance-only merge): three pipeline
 * queues plus one unified maintenance queue. The legacy per-job maintenance
 * queues are intentionally absent — they have no workers.
 */
export const ALL_QUEUES = [
  QUEUE_AI_FORMATTING,
  QUEUE_PDF_GENERATION,
  QUEUE_PAGE_COUNT,
  QUEUE_MAINTENANCE,
] as const;

/**
 * Legacy maintenance queue names to purge on boot (Phase 4 cutover cleanup).
 */
export const LEGACY_MAINTENANCE_QUEUES = [
  LEGACY_QUEUE_PRODUCTION_DELAY,
  LEGACY_QUEUE_AUDIT_LOG_ARCHIVER,
] as const;

/**
 * Job names within each queue.
 * Defined now for type safety — processors are implemented in Phase 5.
 */
export const JOB_NAMES = {
  /** Gemini AI formats manuscript into semantic HTML */
  FORMAT_MANUSCRIPT: "format-manuscript",
  /** Gotenberg generates print-ready PDF from formatted HTML */
  GENERATE_PDF: "generate-pdf",
  /** Gotenberg renders HTML to count authoritative pages for billing */
  COUNT_PAGES: "count-pages",
  /** Runs the production delay backlog monitor and event sync */
  CHECK_PRODUCTION_DELAY: "check-production-delay",
  /** Nightly purge of AuditLog rows older than AUDIT_LOG_RETENTION_DAYS */
  ARCHIVE_AUDIT_LOGS: "archive-audit-logs",
  /**
   * Finalises successful Paystack charges that never became Orders (missed
   * webhook / customer never returned from the redirect).
   */
  RECONCILE_PAYMENTS: "reconcile-payments",
} as const;
