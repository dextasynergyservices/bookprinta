import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ProductionDelayMonitorService } from "../production-delay/production-delay-monitor.service.js";
import { JOB_NAMES, QUEUE_PRODUCTION_DELAY } from "./jobs.constants.js";

type ProductionDelayMonitorPayload = {
  source: "scheduler";
};

@Injectable()
@Processor(QUEUE_PRODUCTION_DELAY, {
  concurrency: 1,
})
export class ProductionDelayProcessor extends WorkerHost {
  private readonly logger = new Logger(ProductionDelayProcessor.name);

  constructor(private readonly productionDelayMonitor: ProductionDelayMonitorService) {
    super();
  }

  async process(
    job: Job
  ): Promise<Awaited<ReturnType<ProductionDelayMonitorService["runScheduledCheck"]>>> {
    if (job.name !== JOB_NAMES.CHECK_PRODUCTION_DELAY) {
      throw new Error(`Unsupported production-delay job name "${job.name}"`);
    }

    this.parsePayload(job.data);

    const result = await this.productionDelayMonitor.runScheduledCheck();

    this.logger.log(
      `Processed production delay monitor job ${String(job.id ?? "unknown")} (action=${result.action}, activeEventId=${result.activeEventId ?? "none"}, backlog=${result.resolution.backlogCount})`
    );

    return result;
  }

  private parsePayload(value: unknown): ProductionDelayMonitorPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid production-delay payload.");
    }

    const payload = value as Record<string, unknown>;
    if (payload.source !== "scheduler") {
      throw new Error("Invalid source in production-delay payload.");
    }

    return {
      source: "scheduler",
    };
  }
}
