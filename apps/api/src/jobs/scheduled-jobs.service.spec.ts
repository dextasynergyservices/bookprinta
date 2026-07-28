/// <reference types="jest" />
import type { Queue } from "bullmq";
import type { RedisService } from "../redis/redis.service.js";
import { JOB_NAMES } from "./jobs.constants.js";
import { ScheduledJobsService } from "./scheduled-jobs.service.js";

type MockQueue = {
  name: string;
  getJobs: jest.Mock;
  add: jest.Mock;
};

type MockRedisClient = {
  scan: jest.Mock;
  unlink: jest.Mock;
};

function mockMaintenanceQueue(): MockQueue {
  return {
    name: "bp-maintenance",
    getJobs: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
  };
}

function mockRedis(client: MockRedisClient | null): RedisService {
  return { getClient: () => client } as unknown as RedisService;
}

function build(queue: MockQueue, redis: RedisService) {
  return new ScheduledJobsService(queue as unknown as Queue, redis);
}

describe("ScheduledJobsService", () => {
  let queue: MockQueue;

  beforeEach(() => {
    queue = mockMaintenanceQueue();
    jest.restoreAllMocks();
  });

  describe("legacy queue cleanup on boot", () => {
    it("deletes all Redis keys for both legacy maintenance queues", async () => {
      const client: MockRedisClient = {
        // One SCAN page per queue, then cursor "0" to stop.
        scan: jest
          .fn()
          .mockResolvedValueOnce(["0", ["bull:production-delay:meta", "bull:production-delay:1"]])
          .mockResolvedValueOnce(["0", ["bull:audit-log-archiver:meta"]]),
        unlink: jest.fn().mockResolvedValue(1),
      };

      await build(queue, mockRedis(client)).onModuleInit();

      expect(client.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        "bull:production-delay:*",
        "COUNT",
        100
      );
      expect(client.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        "bull:audit-log-archiver:*",
        "COUNT",
        100
      );
      expect(client.unlink).toHaveBeenCalledWith(
        "bull:production-delay:meta",
        "bull:production-delay:1"
      );
      expect(client.unlink).toHaveBeenCalledWith("bull:audit-log-archiver:meta");
    });

    it("no-ops safely when Redis is unavailable at boot", async () => {
      await expect(build(queue, mockRedis(null)).onModuleInit()).resolves.toBeUndefined();
    });

    it("does not throw when a SCAN fails mid-cleanup", async () => {
      const client: MockRedisClient = {
        scan: jest.fn().mockRejectedValue(new Error("Connection is closed.")),
        unlink: jest.fn(),
      };

      await expect(build(queue, mockRedis(client)).onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe("triggers", () => {
    it("enqueues a production-delay check onto the maintenance queue", async () => {
      const result = await build(queue, mockRedis(null)).triggerProductionDelayCheck("cron");

      expect(result).toMatchObject({ queued: true, jobId: "job-1", queue: "bp-maintenance" });
      const [jobName, payload, opts] = queue.add.mock.calls[0];
      expect(jobName).toBe(JOB_NAMES.CHECK_PRODUCTION_DELAY);
      expect(payload).toEqual({ source: "cron" });
      // No `delay` option — a delayed job is what forced the old 10s poll clamp.
      expect(opts).not.toHaveProperty("delay");
    });

    it("enqueues an audit-log archive onto the maintenance queue", async () => {
      const result = await build(queue, mockRedis(null)).triggerAuditLogArchive("cron");

      expect(result.queued).toBe(true);
      expect(queue.add.mock.calls[0][0]).toBe(JOB_NAMES.ARCHIVE_AUDIT_LOGS);
    });

    it("dedupes per job NAME: a pending delay check blocks another delay check", async () => {
      queue.getJobs.mockResolvedValue([{ name: JOB_NAMES.CHECK_PRODUCTION_DELAY }]);

      const result = await build(queue, mockRedis(null)).triggerProductionDelayCheck("cron");

      expect(result.queued).toBe(false);
      expect(result.reason).toMatch(/already/i);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("dedupes per job NAME: a pending delay check does NOT block an audit archive", async () => {
      // The critical correctness point of sharing one queue between two job types.
      queue.getJobs.mockResolvedValue([{ name: JOB_NAMES.CHECK_PRODUCTION_DELAY }]);

      const result = await build(queue, mockRedis(null)).triggerAuditLogArchive("cron");

      expect(result.queued).toBe(true);
      expect(queue.add).toHaveBeenCalledWith(
        JOB_NAMES.ARCHIVE_AUDIT_LOGS,
        { source: "cron" },
        expect.objectContaining({ attempts: 1 })
      );
    });
  });
});
