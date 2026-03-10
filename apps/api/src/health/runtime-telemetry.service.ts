import { Injectable } from "@nestjs/common";

export type FirstRequestRecord = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  completedAt: string;
  msSinceBootstrapCompleted: number | null;
};

export type RuntimeSnapshot = {
  processStartedAt: string;
  bootstrapStartedAt: string | null;
  bootstrapCompletedAt: string | null;
  startupDurationMs: number | null;
  firstRequest: FirstRequestRecord | null;
};

@Injectable()
export class RuntimeTelemetryService {
  private readonly processStartedAtMs = Date.now();
  private bootstrapStartedAtMs: number | null = null;
  private bootstrapCompletedAtMs: number | null = null;
  private firstRequest: FirstRequestRecord | null = null;

  markBootstrapStarted(startedAtMs: number): void {
    this.bootstrapStartedAtMs = startedAtMs;
  }

  markBootstrapCompleted(completedAtMs: number): RuntimeSnapshot {
    this.bootstrapCompletedAtMs = completedAtMs;
    return this.getSnapshot();
  }

  recordFirstRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    completedAtMs: number;
  }): FirstRequestRecord | null {
    if (this.firstRequest) return null;

    const msSinceBootstrapCompleted =
      this.bootstrapCompletedAtMs === null
        ? null
        : input.completedAtMs - this.bootstrapCompletedAtMs;

    this.firstRequest = {
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      completedAt: new Date(input.completedAtMs).toISOString(),
      msSinceBootstrapCompleted,
    };

    return this.firstRequest;
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      processStartedAt: new Date(this.processStartedAtMs).toISOString(),
      bootstrapStartedAt:
        this.bootstrapStartedAtMs === null
          ? null
          : new Date(this.bootstrapStartedAtMs).toISOString(),
      bootstrapCompletedAt:
        this.bootstrapCompletedAtMs === null
          ? null
          : new Date(this.bootstrapCompletedAtMs).toISOString(),
      startupDurationMs:
        this.bootstrapStartedAtMs === null || this.bootstrapCompletedAtMs === null
          ? null
          : Math.max(0, this.bootstrapCompletedAtMs - this.bootstrapStartedAtMs),
      firstRequest: this.firstRequest,
    };
  }
}
