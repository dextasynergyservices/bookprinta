import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  AUDIT_LOG_ARCHIVER_INTERVAL_MS,
  AUDIT_LOG_ARCHIVER_JOB_SCHEDULER_ID,
  JOB_NAMES,
  QUEUE_AUDIT_LOG_ARCHIVER,
} from "./jobs.constants.js";

@Injectable()
export class AuditLogArchiverScheduler implements OnModuleInit {
  private readonly logger = new Logger(AuditLogArchiverScheduler.name);

  constructor(
    @InjectQueue(QUEUE_AUDIT_LOG_ARCHIVER)
    private readonly auditLogArchiverQueue: Queue
  ) {}

  async onModuleInit(): Promise<void> {
    await this.auditLogArchiverQueue.upsertJobScheduler(
      AUDIT_LOG_ARCHIVER_JOB_SCHEDULER_ID,
      {
        every: AUDIT_LOG_ARCHIVER_INTERVAL_MS,
      },
      {
        name: JOB_NAMES.ARCHIVE_AUDIT_LOGS,
        data: {
          source: "scheduler",
        },
        opts: {
          attempts: 1,
          removeOnComplete: {
            count: 7, // keep last 7 runs for debugging (one week)
          },
          removeOnFail: {
            count: 14,
          },
        },
      }
    );

    this.logger.log(
      `Registered AuditLog archiver scheduler (${AUDIT_LOG_ARCHIVER_JOB_SCHEDULER_ID}) every ${AUDIT_LOG_ARCHIVER_INTERVAL_MS}ms`
    );
  }
}
