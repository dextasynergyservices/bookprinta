/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import type { Job } from "bullmq";
import { ProductionDelayMonitorService } from "../production-delay/production-delay-monitor.service.js";
import { JOB_NAMES } from "./jobs.constants.js";
import { ProductionDelayProcessor } from "./production-delay.processor.js";

const mockProductionDelayMonitorService = {
  runScheduledCheck: jest.fn(),
};

describe("ProductionDelayProcessor", () => {
  let processor: ProductionDelayProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayProcessor,
        {
          provide: ProductionDelayMonitorService,
          useValue: mockProductionDelayMonitorService,
        },
      ],
    }).compile();

    processor = module.get<ProductionDelayProcessor>(ProductionDelayProcessor);
    jest.clearAllMocks();
  });

  it("processes the scheduled monitor job through the monitor service", async () => {
    mockProductionDelayMonitorService.runScheduledCheck.mockResolvedValue({
      action: "opened_auto_event",
      activeEventId: "cmdelay1",
      resolution: {
        backlogCount: 25,
      },
    });

    const job = {
      id: "bulljob-delay-1",
      name: JOB_NAMES.CHECK_PRODUCTION_DELAY,
      data: {
        source: "scheduler",
      },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(mockProductionDelayMonitorService.runScheduledCheck).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("opened_auto_event");
    expect(result.activeEventId).toBe("cmdelay1");
  });

  it("rejects unsupported production-delay job names", async () => {
    const job = {
      id: "bulljob-delay-2",
      name: "unexpected-job-name",
      data: {
        source: "scheduler",
      },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow(
      'Unsupported production-delay job name "unexpected-job-name"'
    );
  });
});
