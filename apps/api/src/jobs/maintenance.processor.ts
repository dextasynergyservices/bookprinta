import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";
import { PaymentsService } from "../payments/payments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProductionDelayMonitorService } from "../production-delay/production-delay-monitor.service.js";
import {
  AUDIT_LOG_RETENTION_DAYS,
  JOB_NAMES,
  MAINTENANCE_WORKER_OPTS,
  QUEUE_MAINTENANCE,
} from "./jobs.constants.js";

/** How many AuditLog rows to delete per batch — avoids long-running transactions. */
const DELETE_BATCH_SIZE = 1_000;

type AuditLogArchiveResult = {
  cutoffDate: string;
  totalDeleted: number;
  batches: number;
};

/**
 * MaintenanceProcessor — single worker for all periodic maintenance jobs
 * (Phase 4, maintenance-only merge; see docs/infra-cost-hardening-plan.md).
 *
 * Replaces the separate ProductionDelayProcessor and AuditLogArchiverProcessor.
 * One worker instead of two removes an idle Redis polling loop. The job NAME
 * selects the work:
 *   - CHECK_PRODUCTION_DELAY → backlog monitor (via ProductionDelayMonitorService)
 *   - ARCHIVE_AUDIT_LOGS     → hard-delete AuditLog rows past retention
 *
 * Both are non-billing, idempotent, and triggered by external cron (Phase 1b via
 * CronController → ScheduledJobsService), so nothing about the money path or the
 * pipeline queues is affected.
 */
@Injectable()
@Processor(QUEUE_MAINTENANCE, MAINTENANCE_WORKER_OPTS)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly productionDelayMonitor: ProductionDelayMonitorService,
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_NAMES.CHECK_PRODUCTION_DELAY:
        return this.runProductionDelayCheck(job);
      case JOB_NAMES.ARCHIVE_AUDIT_LOGS:
        return this.runAuditLogArchive(job);
      case JOB_NAMES.RECONCILE_PAYMENTS:
        return this.runPaymentReconciliation(job);
      default:
        throw new Error(`Unsupported maintenance job name "${job.name}"`);
    }
  }

  private async runProductionDelayCheck(job: Job) {
    const result = await this.productionDelayMonitor.runScheduledCheck();

    this.logger.log(
      `Production delay monitor job ${String(job.id ?? "unknown")} (source=${this.readSource(job)}, ` +
        `action=${result.action}, activeEventId=${result.activeEventId ?? "none"}, ` +
        `backlog=${result.resolution.backlogCount})`
    );

    return result;
  }

  private async runAuditLogArchive(job: Job): Promise<AuditLogArchiveResult> {
    const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1_000);

    this.logger.log(
      `AuditLog archiver job ${String(job.id ?? "unknown")} (source=${this.readSource(job)}) — ` +
        `deleting rows created before ${cutoff.toISOString()} (${AUDIT_LOG_RETENTION_DAYS}-day retention)`
    );

    let totalDeleted = 0;
    let batches = 0;

    // Prisma has no DELETE … LIMIT, so we find-then-delete in batches.
    // The @@index([createdAt]) on AuditLog keeps the findMany fast.
    while (true) {
      const toDelete = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });

      if (toDelete.length === 0) break;

      const ids = toDelete.map((r) => r.id);
      const { count } = await this.prisma.auditLog.deleteMany({ where: { id: { in: ids } } });

      totalDeleted += count;
      batches += 1;

      if (toDelete.length < DELETE_BATCH_SIZE) break;
    }

    this.logger.log(
      `AuditLog archiver complete — deleted ${totalDeleted} row(s) in ${batches} batch(es)`
    );

    return { cutoffDate: cutoff.toISOString(), totalDeleted, batches };
  }

  /**
   * Finalises successful Paystack charges that never became Orders — the safety
   * net for our shared-integration setup, where BookPrinta cannot own the single
   * Paystack webhook URL. See PaymentsService.reconcilePaystackPayments().
   */
  private async runPaymentReconciliation(job: Job) {
    const result = await this.paymentsService.reconcilePaystackPayments();

    const logLine =
      `Payment reconciliation job ${String(job.id ?? "unknown")} (source=${this.readSource(job)}) — ` +
      `scanned=${result.scanned} ours=${result.ours} finalised=${result.finalised} ` +
      `failed=${result.failed} foreignSkipped=${result.skippedForeign}`;

    // Finalising anything here means a real charge slipped through the redirect
    // path, which is worth surfacing rather than burying at log level.
    if (result.finalised > 0 || result.failed > 0) {
      this.logger.warn(logLine);

      // Pino writes straight to stdout, so warn/error logs never reach Sentry on
      // their own — capture explicitly. Guarded so healthy runs stay silent:
      // an event every 30 minutes saying "nothing to do" would train us to
      // ignore the one run that matters.
      Sentry.captureMessage(
        `Payment reconciliation finalised ${result.finalised} orphaned Paystack charge(s)` +
          (result.failed > 0 ? `, ${result.failed} failed` : ""),
        {
          level: result.failed > 0 ? "error" : "warning",
          tags: { queue: QUEUE_MAINTENANCE, job_name: JOB_NAMES.RECONCILE_PAYMENTS },
          extra: { ...result, jobId: String(job.id ?? "unknown"), source: this.readSource(job) },
        }
      );
    } else {
      this.logger.log(logLine);
    }

    return result;
  }

  /**
   * `source` is telemetry only (which trigger enqueued the job: cron/admin/manual).
   * It is NOT validated as a boundary — the previous per-job processors threw on
   * any source other than the literal "scheduler", which silently broke every
   * cron-triggered run once Phase 1b started sending "cron". Read it for logging
   * and move on.
   */
  private readSource(job: Job): string {
    const data = job.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const source = (data as Record<string, unknown>).source;
      if (typeof source === "string" && source.length > 0) return source;
    }
    return "unknown";
  }

  @OnWorkerEvent("failed")
  onJobFailed(job: Job | undefined, error: unknown): void {
    // Maintenance jobs run attempts:1 (no retries), so any failure is terminal.
    // These are best-effort background tasks — cron re-runs them on the next tick —
    // so we surface to Sentry for visibility but do not page anyone.
    const errorMessage =
      error instanceof Error && error.message.trim().length > 0 ? error.message : String(error);

    this.logger.error(
      `Maintenance job ${String(job?.id ?? "unknown")} (${job?.name ?? "unknown"}) failed: ${errorMessage}`
    );

    Sentry.withScope((scope) => {
      scope.setTag("queue", QUEUE_MAINTENANCE);
      scope.setTag("job_name", job?.name ?? "unknown");
      scope.setTag("job_id", String(job?.id ?? "unknown"));
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  }
}
