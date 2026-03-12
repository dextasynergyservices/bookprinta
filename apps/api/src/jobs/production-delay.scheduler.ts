import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  JOB_NAMES,
  PRODUCTION_DELAY_JOB_SCHEDULER_ID,
  PRODUCTION_DELAY_MONITOR_INTERVAL_MS,
  QUEUE_PRODUCTION_DELAY,
} from "./jobs.constants.js";

@Injectable()
export class ProductionDelayScheduler implements OnModuleInit {
  private readonly logger = new Logger(ProductionDelayScheduler.name);

  constructor(
    @InjectQueue(QUEUE_PRODUCTION_DELAY)
    private readonly productionDelayQueue: Queue
  ) {}

  async onModuleInit(): Promise<void> {
    await this.productionDelayQueue.upsertJobScheduler(
      PRODUCTION_DELAY_JOB_SCHEDULER_ID,
      {
        every: PRODUCTION_DELAY_MONITOR_INTERVAL_MS,
      },
      {
        name: JOB_NAMES.CHECK_PRODUCTION_DELAY,
        data: {
          source: "scheduler",
        },
        opts: {
          attempts: 1,
          removeOnComplete: {
            count: 24,
          },
          removeOnFail: {
            count: 48,
          },
        },
      }
    );

    this.logger.log(
      `Registered production delay monitor scheduler (${PRODUCTION_DELAY_JOB_SCHEDULER_ID}) every ${PRODUCTION_DELAY_MONITOR_INTERVAL_MS}ms`
    );
  }
}
