/// <reference types="jest" />
import type { Worker } from "bullmq";
import { RedisCircuitBreakerService } from "./redis-circuit-breaker.service.js";

describe("RedisCircuitBreakerService", () => {
  let service: RedisCircuitBreakerService;
  let mockWorker: { pause: jest.Mock; resume: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    service = new RedisCircuitBreakerService();
    mockWorker = {
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe("isRateLimitError", () => {
    it("identifies Upstash rate-limit reply errors", () => {
      const err = new Error(
        "ReplyError: ERR Your database has been temporarily rate-limited, please contact support@upstash.com"
      );
      expect(service.isRateLimitError(err)).toBe(true);
    });

    it("identifies daily request limit errors", () => {
      expect(service.isRateLimitError("daily request limit exceeded")).toBe(true);
    });

    it("identifies max requests limit exceeded errors", () => {
      expect(service.isRateLimitError(new Error("max requests limit exceeded"))).toBe(true);
    });

    it("identifies maxmemory quota exceeded errors", () => {
      expect(
        service.isRateLimitError("OOM command not allowed when used memory > 'maxmemory'")
      ).toBe(true);
    });

    it("returns false for standard connection drops or other errors", () => {
      expect(service.isRateLimitError(new Error("ECONNREFUSED 127.0.0.1:6379"))).toBe(false);
      expect(service.isRateLimitError(new Error("ETIMEDOUT"))).toBe(false);
      expect(service.isRateLimitError(null)).toBe(false);
    });
  });

  describe("handleError and worker pausing", () => {
    it("does not trip on non-rate-limit errors", () => {
      service.registerWorker("test-queue", mockWorker as unknown as Worker);

      const handled = service.handleError(new Error("Generic error"));
      expect(handled).toBe(false);
      expect(service.isOpen()).toBe(false);
      expect(mockWorker.pause).not.toHaveBeenCalled();
    });

    it("trips and pauses all registered workers on rate-limit error", () => {
      service.registerWorker("test-queue", mockWorker as unknown as Worker);

      const handled = service.handleError(
        new Error("ERR Your database has been temporarily rate-limited")
      );
      expect(handled).toBe(true);
      expect(service.isOpen()).toBe(true);
      expect(service.getReason()).toContain("temporarily rate-limited");
      expect(mockWorker.pause).toHaveBeenCalledWith(true);
    });

    it("pauses newly registered worker if breaker is already tripped", () => {
      service.trip("Testing trip");
      expect(service.isOpen()).toBe(true);

      service.registerWorker("new-queue", mockWorker as unknown as Worker);
      expect(mockWorker.pause).toHaveBeenCalledWith(true);
    });
  });

  describe("reset and probe recovery", () => {
    it("resumes workers when manually reset", () => {
      service.registerWorker("test-queue", mockWorker as unknown as Worker);
      service.trip("Testing trip");

      service.reset();
      expect(service.isOpen()).toBe(false);
      expect(service.getReason()).toBeNull();
      expect(mockWorker.resume).toHaveBeenCalled();
    });

    it("resets and resumes workers when ping probe succeeds", async () => {
      const pingProbe = jest.fn().mockResolvedValue("PONG");
      service.setPingProbe(pingProbe);
      service.registerWorker("test-queue", mockWorker as unknown as Worker);

      service.trip("Testing trip");
      expect(service.isOpen()).toBe(true);

      const reset = await service.attemptReset();
      expect(reset).toBe(true);
      expect(service.isOpen()).toBe(false);
      expect(mockWorker.resume).toHaveBeenCalled();
    });

    it("backs off and stays open when ping probe fails with rate-limit error", async () => {
      const pingProbe = jest
        .fn()
        .mockRejectedValue(new Error("ERR Your database has been temporarily rate-limited"));
      service.setPingProbe(pingProbe);
      service.registerWorker("test-queue", mockWorker as unknown as Worker);

      service.trip("Testing trip");

      const reset = await service.attemptReset();
      expect(reset).toBe(false);
      expect(service.isOpen()).toBe(true);
      expect(mockWorker.resume).not.toHaveBeenCalled();
    });
  });
});
