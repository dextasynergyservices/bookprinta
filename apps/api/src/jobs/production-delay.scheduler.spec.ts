/// <reference types="jest" />

import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  JOB_NAMES,
  PRODUCTION_DELAY_JOB_SCHEDULER_ID,
  PRODUCTION_DELAY_MONITOR_INTERVAL_MS,
  QUEUE_PRODUCTION_DELAY,
} from "./jobs.constants.js";
import { ProductionDelayScheduler } from "./production-delay.scheduler.js";

const mockProductionDelayQueue = {
  upsertJobScheduler: jest.fn(),
};

describe("ProductionDelayScheduler", () => {
  let scheduler: ProductionDelayScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayScheduler,
        {
          provide: getQueueToken(QUEUE_PRODUCTION_DELAY),
          useValue: mockProductionDelayQueue,
        },
      ],
    }).compile();

    scheduler = module.get<ProductionDelayScheduler>(ProductionDelayScheduler);
    jest.clearAllMocks();
  });

  it("registers the repeatable production delay monitor job every 15 minutes", async () => {
    mockProductionDelayQueue.upsertJobScheduler.mockResolvedValue({});

    await scheduler.onModuleInit();

    expect(mockProductionDelayQueue.upsertJobScheduler).toHaveBeenCalledWith(
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
  });
});
