import { Global, Injectable, Module } from "@nestjs/common";

/**
 * PendingRedisSignal — in-memory hint that at least one pipeline job has been
 * parked as `PENDING_REDIS` and is waiting for Redis to recover.
 *
 * Why this exists (docs/infra-cost-hardening-plan.md, Phase 6):
 * `JobRecoveryService` used to poll Postgres every 30s for parked jobs, which in
 * normal operation returns zero rows — ~2,880 wasted Neon queries/day. The
 * recovery loop now consults this flag and only queries the DB when there is
 * plausibly work to do (plus a low-frequency safety sweep).
 *
 * It is a deliberately dumb boolean:
 *  - `BooksPipelineService` calls `markPending()` when it parks a job because
 *    Redis was unreachable at enqueue time.
 *  - `JobRecoveryService` reads `isPending()` to decide whether to query, and
 *    calls `clear()` once a sweep finds no parked jobs remain.
 *
 * Provided by a `@Global` module so both services (which live in different
 * feature modules with an existing jobs→books dependency) can inject it without
 * creating an import cycle.
 *
 * Scope note: the flag is per-process. A low-frequency safety sweep in
 * `JobRecoveryService` (independent of this flag) covers the cases a pure flag
 * would miss — jobs parked by a previous process, or by another instance under
 * horizontal scaling.
 */
@Injectable()
export class PendingRedisSignal {
  private pending = false;

  /** Signal that a job was just parked as PENDING_REDIS. */
  markPending(): void {
    this.pending = true;
  }

  /** True if a park has been signalled since the last `clear()`. */
  isPending(): boolean {
    return this.pending;
  }

  /** Called by the recovery loop once it confirms no parked jobs remain. */
  clear(): void {
    this.pending = false;
  }
}

@Global()
@Module({
  providers: [PendingRedisSignal],
  exports: [PendingRedisSignal],
})
export class PendingRedisSignalModule {}
