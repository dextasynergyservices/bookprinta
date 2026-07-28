/// <reference types="jest" />
import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";

// Sentry's module exports are non-configurable, so jest.spyOn cannot patch them.
jest.mock("@sentry/node", () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((fn: (scope: unknown) => void) =>
    fn({ setTag: jest.fn(), setContext: jest.fn() })
  ),
}));

const captureMessage = Sentry.captureMessage as unknown as jest.Mock;

import { PaymentsService } from "../payments/payments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProductionDelayMonitorService } from "../production-delay/production-delay-monitor.service.js";
import { JOB_NAMES } from "./jobs.constants.js";
import { MaintenanceProcessor } from "./maintenance.processor.js";

const mockMonitor = {
  runScheduledCheck: jest.fn(),
};

const mockPrisma = {
  auditLog: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockPayments = {
  reconcilePaystackPayments: jest.fn(),
};

function build() {
  return new MaintenanceProcessor(
    mockMonitor as unknown as ProductionDelayMonitorService,
    mockPrisma as unknown as PrismaService,
    mockPayments as unknown as PaymentsService
  );
}

function job(name: string, data: unknown = { source: "cron" }): Job {
  return { id: "bulljob-1", name, data } as unknown as Job;
}

describe("MaintenanceProcessor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("production delay check", () => {
    it("runs the backlog monitor for a CHECK_PRODUCTION_DELAY job", async () => {
      mockMonitor.runScheduledCheck.mockResolvedValue({
        action: "opened_auto_event",
        activeEventId: "cmdelay1",
        resolution: { backlogCount: 25 },
      });

      const result = (await build().process(job(JOB_NAMES.CHECK_PRODUCTION_DELAY))) as {
        action: string;
        activeEventId: string;
      };

      expect(mockMonitor.runScheduledCheck).toHaveBeenCalledTimes(1);
      expect(result.action).toBe("opened_auto_event");
      expect(result.activeEventId).toBe("cmdelay1");
    });

    // Regression: the old per-job processors threw on any source !== "scheduler",
    // which silently broke every cron-triggered run once Phase 1b sent "cron".
    // The merged processor must accept whatever source the trigger sends.
    it.each([
      "cron",
      "admin",
      "manual",
      "scheduler",
    ])("accepts source=%s without throwing", async (source) => {
      mockMonitor.runScheduledCheck.mockResolvedValue({
        action: "noop",
        activeEventId: null,
        resolution: { backlogCount: 0 },
      });

      await expect(
        build().process(job(JOB_NAMES.CHECK_PRODUCTION_DELAY, { source }))
      ).resolves.toBeDefined();
    });
  });

  describe("audit log archive", () => {
    it("deletes audit rows past retention in batches and reports the total", async () => {
      // Two batches: first returns a full batch, second returns the remainder.
      mockPrisma.auditLog.findMany
        .mockResolvedValueOnce(Array.from({ length: 1_000 }, (_, i) => ({ id: `a${i}` })))
        .mockResolvedValueOnce([{ id: "tail-1" }, { id: "tail-2" }]);
      mockPrisma.auditLog.deleteMany
        .mockResolvedValueOnce({ count: 1_000 })
        .mockResolvedValueOnce({ count: 2 });

      const result = (await build().process(job(JOB_NAMES.ARCHIVE_AUDIT_LOGS))) as {
        totalDeleted: number;
        batches: number;
      };

      expect(result.totalDeleted).toBe(1_002);
      expect(result.batches).toBe(2);
      expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalledTimes(2);
    });

    it("does nothing when there are no rows past retention", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      const result = (await build().process(job(JOB_NAMES.ARCHIVE_AUDIT_LOGS))) as {
        totalDeleted: number;
        batches: number;
      };

      expect(result.totalDeleted).toBe(0);
      expect(result.batches).toBe(0);
      expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("payment reconciliation", () => {
    it("delegates to PaymentsService and returns the run summary", async () => {
      mockPayments.reconcilePaystackPayments.mockResolvedValue({
        scanned: 12,
        ours: 4,
        alreadyProcessed: 3,
        finalised: 1,
        failed: 0,
        skippedForeign: 8,
      });

      const result = (await build().process(job(JOB_NAMES.RECONCILE_PAYMENTS))) as {
        finalised: number;
        skippedForeign: number;
      };

      expect(mockPayments.reconcilePaystackPayments).toHaveBeenCalledTimes(1);
      expect(result.finalised).toBe(1);
      // Charges belonging to the other product on the shared Paystack
      // integration must be reported as skipped, never finalised.
      expect(result.skippedForeign).toBe(8);
    });

    it("reports finalised charges to Sentry (Pino logs never reach it)", async () => {
      const capture = captureMessage;
      mockPayments.reconcilePaystackPayments.mockResolvedValue({
        scanned: 5,
        ours: 2,
        alreadyProcessed: 1,
        finalised: 1,
        failed: 0,
        skippedForeign: 3,
      });

      await build().process(job(JOB_NAMES.RECONCILE_PAYMENTS));

      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][0]).toContain("orphaned Paystack charge");
      expect(capture.mock.calls[0][1]).toMatchObject({ level: "warning" });
    });

    it("stays SILENT on a healthy run so the alert never becomes noise", async () => {
      const capture = captureMessage;
      mockPayments.reconcilePaystackPayments.mockResolvedValue({
        scanned: 5,
        ours: 2,
        alreadyProcessed: 2,
        finalised: 0,
        failed: 0,
        skippedForeign: 3,
      });

      await build().process(job(JOB_NAMES.RECONCILE_PAYMENTS));

      expect(capture).not.toHaveBeenCalled();
    });

    it("escalates to error level when a finalisation failed", async () => {
      const capture = captureMessage;
      mockPayments.reconcilePaystackPayments.mockResolvedValue({
        scanned: 5,
        ours: 2,
        alreadyProcessed: 0,
        finalised: 1,
        failed: 1,
        skippedForeign: 3,
      });

      await build().process(job(JOB_NAMES.RECONCILE_PAYMENTS));

      expect(capture.mock.calls[0][1]).toMatchObject({ level: "error" });
    });

    it("propagates failures so the job is marked failed", async () => {
      mockPayments.reconcilePaystackPayments.mockRejectedValue(new Error("Paystack list failed"));

      await expect(build().process(job(JOB_NAMES.RECONCILE_PAYMENTS))).rejects.toThrow(
        "Paystack list failed"
      );
    });
  });

  it("rejects an unknown maintenance job name", async () => {
    await expect(build().process(job("unexpected-job"))).rejects.toThrow(
      'Unsupported maintenance job name "unexpected-job"'
    );
  });
});
