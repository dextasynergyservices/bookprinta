/// <reference types="jest" />
import type { Queue } from "bullmq";
import { PendingRedisSignal } from "../common/pending-redis-signal.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RedisService } from "../redis/redis.service.js";
import { JobRecoveryService } from "./job-recovery.service.js";

const mockPrisma = {
  job: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
};

const mockRedis = {
  isAvailable: jest.fn().mockReturnValue(true),
};

const mockQueue = { add: jest.fn().mockResolvedValue({ id: "q1" }) };

function build(signal: PendingRedisSignal) {
  return new JobRecoveryService(
    mockPrisma as unknown as PrismaService,
    mockRedis as unknown as RedisService,
    signal,
    mockQueue as unknown as Queue,
    mockQueue as unknown as Queue,
    mockQueue as unknown as Queue
  );
}

describe("JobRecoveryService — Phase 6 DB-poll gating", () => {
  let signal: PendingRedisSignal;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockRedis.isAvailable.mockReturnValue(true);
    signal = new PendingRedisSignal();
  });

  it("does not query the DB on a tick when nothing is parked and the safety sweep is not due", async () => {
    const service = build(signal);
    // Fresh service, signal clear. First tick within the safety window.
    // (lastSweepAtMs defaults to 0, so simulate a recent sweep first.)
    signal.markPending();
    await service.recoverPendingRedisJobs(); // records lastSweep, clears signal (0 rows)
    mockPrisma.job.findMany.mockClear();

    // Now tick via the private path: signal clear + recent sweep → no query.
    await (service as unknown as { tick: () => Promise<void> }).tick();

    expect(mockPrisma.job.findMany).not.toHaveBeenCalled();
  });

  it("queries the DB on a tick when a park has been signalled", async () => {
    const service = build(signal);
    signal.markPending();

    await (service as unknown as { tick: () => Promise<void> }).tick();

    expect(mockPrisma.job.findMany).toHaveBeenCalledTimes(1);
  });

  it("clears the signal once a sweep finds no parked jobs remain", async () => {
    const service = build(signal);
    signal.markPending();

    await service.recoverPendingRedisJobs();

    expect(signal.isPending()).toBe(false);
  });

  it("keeps the signal set (does not sweep-complete) while Redis is still down", async () => {
    const service = build(signal);
    signal.markPending();
    mockRedis.isAvailable.mockReturnValue(false);

    await service.recoverPendingRedisJobs();

    // Redis down → no query, signal stays set so we retry next tick.
    expect(mockPrisma.job.findMany).not.toHaveBeenCalled();
    expect(signal.isPending()).toBe(true);
  });

  it("boot reconciliation raises the signal when a previous process left parked jobs", async () => {
    mockPrisma.job.count.mockResolvedValue(3);
    const service = build(signal);

    await (service as unknown as { reconcileOnBoot: () => Promise<void> }).reconcileOnBoot();

    expect(signal.isPending()).toBe(true);
  });

  it("boot reconciliation leaves the signal clear when nothing is parked", async () => {
    mockPrisma.job.count.mockResolvedValue(0);
    const service = build(signal);

    await (service as unknown as { reconcileOnBoot: () => Promise<void> }).reconcileOnBoot();

    expect(signal.isPending()).toBe(false);
  });
});
