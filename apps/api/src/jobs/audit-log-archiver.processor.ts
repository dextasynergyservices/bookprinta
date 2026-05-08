import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service.js";
import { AUDIT_LOG_RETENTION_DAYS, JOB_NAMES, QUEUE_AUDIT_LOG_ARCHIVER } from "./jobs.constants.js";

/** How many rows to delete per Prisma batch — avoids long-running transactions */
const DELETE_BATCH_SIZE = 1_000;

type AuditLogArchivePayload = {
  source: "scheduler";
};

type AuditLogArchiveResult = {
  cutoffDate: string;
  totalDeleted: number;
  batches: number;
};

@Injectable()
@Processor(QUEUE_AUDIT_LOG_ARCHIVER, {
  concurrency: 1,
  // Reduce idle Redis polling from the BullMQ default (5 s) to 5 minutes —
  // this queue only processes one job per 24 hours.
  drainDelay: 5 * 60_000,
})
export class AuditLogArchiverProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogArchiverProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<AuditLogArchiveResult> {
    if (job.name !== JOB_NAMES.ARCHIVE_AUDIT_LOGS) {
      throw new Error(`Unsupported audit-log-archiver job name "${job.name}"`);
    }

    this.parsePayload(job.data);

    const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1_000);

    this.logger.log(
      `Starting AuditLog archiver — deleting rows created before ${cutoff.toISOString()} (${AUDIT_LOG_RETENTION_DAYS}-day retention)`
    );

    let totalDeleted = 0;
    let batches = 0;

    // Prisma does not support DELETE … LIMIT, so we do find-then-delete in batches.
    // The @@index([createdAt]) on AuditLog makes the findMany fast.
    while (true) {
      const toDelete = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });

      if (toDelete.length === 0) break;

      const ids = toDelete.map((r) => r.id);
      const { count } = await this.prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += count;
      batches += 1;

      // If we got fewer rows than the batch size this was the last batch.
      if (toDelete.length < DELETE_BATCH_SIZE) break;
    }

    this.logger.log(
      `AuditLog archiver complete — deleted ${totalDeleted} rows in ${batches} batch(es)`
    );

    return {
      cutoffDate: cutoff.toISOString(),
      totalDeleted,
      batches,
    };
  }

  private parsePayload(value: unknown): AuditLogArchivePayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid audit-log-archiver payload.");
    }

    const payload = value as Record<string, unknown>;
    if (payload.source !== "scheduler") {
      throw new Error("Invalid source in audit-log-archiver payload.");
    }

    return { source: "scheduler" };
  }
}
