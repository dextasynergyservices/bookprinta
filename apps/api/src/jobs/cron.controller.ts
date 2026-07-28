import { Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { CronTokenGuard } from "../common/cron-token.guard.js";
import { ScheduledJobsService } from "./scheduled-jobs.service.js";

/**
 * CronController — external scheduler entry points.
 *
 * Replaces BullMQ job schedulers, which cost ~1M Redis commands/month in idle
 * polling (docs/infra-cost-hardening-plan.md, Phase 1b).
 *
 * Call these from the same external cron account that pings `/health/ping`:
 *
 *   POST /api/v1/cron/production-delay-check   every 15 minutes
 *   POST /api/v1/cron/audit-log-archive        daily
 *
 * Auth: `Authorization: Bearer <CRON_TRIGGER_TOKEN>` or `X-Cron-Token: <token>`.
 *
 * Both handlers return immediately — the work runs on the existing BullMQ
 * workers, so a slow archive cannot time out the cron request.
 *
 * Excluded from Swagger: these are machine endpoints, not part of the public API.
 */
@Controller("cron")
@ApiExcludeController()
@UseGuards(CronTokenGuard)
@SkipThrottle({ short: true, long: true })
export class CronController {
  constructor(private readonly scheduledJobs: ScheduledJobsService) {}

  /**
   * Backlog monitor for production-delay banners/emails.
   * Previously: BullMQ scheduler every 15 minutes.
   */
  @Post("production-delay-check")
  @HttpCode(HttpStatus.ACCEPTED)
  triggerProductionDelayCheck() {
    return this.scheduledJobs.triggerProductionDelayCheck("cron");
  }

  /**
   * Nightly hard-delete of AuditLog rows past the retention window.
   * Previously: BullMQ scheduler every 24 hours.
   */
  @Post("audit-log-archive")
  @HttpCode(HttpStatus.ACCEPTED)
  triggerAuditLogArchive() {
    return this.scheduledJobs.triggerAuditLogArchive("cron");
  }

  /**
   * Finalises successful Paystack charges that never became Orders.
   *
   * Our Paystack integration is shared with another product and Paystack permits
   * only one webhook URL per integration, so BookPrinta cannot rely on webhooks.
   * Without this, a customer who closes the tab on Paystack's success page pays
   * and never gets an order, account, or signup email — silently.
   *
   * Recommended cadence: every 30 minutes.
   */
  @Post("reconcile-payments")
  @HttpCode(HttpStatus.ACCEPTED)
  triggerPaymentReconciliation() {
    return this.scheduledJobs.triggerPaymentReconciliation("cron");
  }
}
