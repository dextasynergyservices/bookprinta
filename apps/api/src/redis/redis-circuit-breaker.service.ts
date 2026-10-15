import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { Worker } from "bullmq";

export const REDIS_RATE_LIMIT_ERROR_PATTERNS = [
  /rate-limit/i,
  /temporarily rate-limited/i,
  /max requests limit exceeded/i,
  /daily request limit exceeded/i,
  /quota exceeded/i,
  /used memory > 'maxmemory'/i,
];

const INITIAL_COOLDOWN_MS = 60_000; // 1 minute
const MAX_COOLDOWN_MS = 300_000; // 5 minutes

@Injectable()
export class RedisCircuitBreakerService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCircuitBreakerService.name);
  private readonly registeredWorkers = new Map<string, Worker>();

  private isTripped = false;
  private tripReason: string | null = null;
  private currentCooldownMs = INITIAL_COOLDOWN_MS;
  private cooldownUntilMs = 0;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingProbeFn: (() => Promise<unknown>) | null = null;

  onModuleDestroy() {
    this.clearProbeTimer();
    this.registeredWorkers.clear();
  }

  /**
   * Register a ping probe function (e.g. redisService.getClient().ping()).
   * Used to automatically verify when Redis has recovered after cooldown.
   */
  setPingProbe(probeFn: () => Promise<unknown>): void {
    this.pingProbeFn = probeFn;
  }

  /**
   * Register a BullMQ worker so the circuit breaker can pause and resume it.
   */
  registerWorker(queueName: string, worker: Worker): void {
    this.registeredWorkers.set(queueName, worker);
    if (this.isTripped) {
      try {
        void worker.pause(true);
      } catch (err) {
        this.logger.warn(`Failed to pause newly registered worker "${queueName}": ${err}`);
      }
    }
  }

  /**
   * Unregister a worker (e.g. during module shutdown).
   */
  unregisterWorker(queueName: string): void {
    this.registeredWorkers.delete(queueName);
  }

  /**
   * Check if a given error message or Error object represents a Redis rate-limit or quota error.
   */
  isRateLimitError(error: unknown): boolean {
    if (!error) return false;
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : (error as { message?: unknown }).message;

    if (typeof message !== "string") return false;
    return REDIS_RATE_LIMIT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  /**
   * Inspects an error; if it is a rate-limit error, trips the circuit breaker.
   * Returns true if the circuit breaker was tripped (or was already open), false otherwise.
   */
  handleError(error: unknown): boolean {
    if (this.isRateLimitError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      this.trip(message);
      return true;
    }
    return false;
  }

  /**
   * Trips the circuit breaker: pauses all BullMQ workers to stop command churn and
   * schedules a cooldown probe check.
   */
  trip(reason: string): void {
    const now = Date.now();
    this.cooldownUntilMs = now + this.currentCooldownMs;
    this.tripReason = reason;

    if (!this.isTripped) {
      this.isTripped = true;
      this.logger.warn(
        `[RedisCircuitBreaker] Upstash/Redis rate-limiting detected: "${reason}". ` +
          `Pausing all BullMQ workers for ${Math.round(this.currentCooldownMs / 1000)}s to prevent outbound bandwidth egress.`
      );
      this.pauseAllWorkers();
    } else {
      this.logger.debug(
        `[RedisCircuitBreaker] Already open; extended cooldown until ${new Date(this.cooldownUntilMs).toISOString()}`
      );
    }

    this.scheduleProbe();
  }

  /**
   * Returns whether the circuit breaker is currently open (tripped).
   */
  isOpen(): boolean {
    return this.isTripped;
  }

  /**
   * Returns the reason why the circuit breaker was tripped.
   */
  getReason(): string | null {
    return this.tripReason;
  }

  /**
   * Manually attempt to reset the circuit breaker by probing Redis health.
   */
  async attemptReset(): Promise<boolean> {
    if (!this.pingProbeFn) {
      this.reset();
      return true;
    }

    try {
      await this.pingProbeFn();
      this.reset();
      return true;
    } catch (err) {
      if (this.isRateLimitError(err)) {
        this.currentCooldownMs = Math.min(this.currentCooldownMs * 2, MAX_COOLDOWN_MS);
        this.trip(err instanceof Error ? err.message : String(err));
      }
      return false;
    }
  }

  /**
   * Resets the circuit breaker and resumes all registered workers.
   */
  reset(): void {
    this.clearProbeTimer();
    const wasTripped = this.isTripped;
    this.isTripped = false;
    this.tripReason = null;
    this.currentCooldownMs = INITIAL_COOLDOWN_MS;
    this.cooldownUntilMs = 0;

    if (wasTripped) {
      this.logger.log("[RedisCircuitBreaker] Redis is healthy again. Resumed all BullMQ workers.");
      this.resumeAllWorkers();
    }
  }

  private pauseAllWorkers(): void {
    for (const [name, worker] of this.registeredWorkers) {
      try {
        void worker.pause(true);
      } catch (err) {
        this.logger.warn(`Could not pause worker "${name}": ${err}`);
      }
    }
  }

  private resumeAllWorkers(): void {
    for (const [name, worker] of this.registeredWorkers) {
      try {
        void worker.resume();
      } catch (err) {
        this.logger.warn(`Could not resume worker "${name}": ${err}`);
      }
    }
  }

  private scheduleProbe(): void {
    this.clearProbeTimer();
    const delay = Math.max(0, this.cooldownUntilMs - Date.now());
    this.probeTimer = setTimeout(() => {
      void this.attemptReset();
    }, delay);
  }

  private clearProbeTimer(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
  }
}
