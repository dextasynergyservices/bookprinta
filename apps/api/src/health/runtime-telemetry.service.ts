import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

export type FirstRequestRecord = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  completedAt: string;
  msSinceBootstrapCompleted: number | null;
};

export type MemoryHighWater = {
  /** Peak resident set size in MB since process start. */
  peakRssMb: number;
  /** Peak V8 heap usage in MB since process start. */
  peakHeapUsedMb: number;
  /** When the current peak RSS was observed. */
  peakRssAt: string | null;
  currentRssMb: number;
  samples: number;
};

export type RuntimeSnapshot = {
  processStartedAt: string;
  bootstrapStartedAt: string | null;
  bootstrapCompletedAt: string | null;
  startupDurationMs: number | null;
  firstRequest: FirstRequestRecord | null;
};

/**
 * How often to sample process memory for the high-water mark.
 *
 * 15s is frequent enough to catch a Gotenberg render spike (renders take
 * seconds to minutes) without adding meaningful overhead — memoryUsage() is a
 * cheap synchronous call and we keep only three numbers.
 */
const MEMORY_SAMPLE_INTERVAL_MS = 15_000;

const BYTES_PER_MB = 1024 * 1024;

function toMb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MB) * 10) / 10;
}

@Injectable()
export class RuntimeTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly processStartedAtMs = Date.now();
  private bootstrapStartedAtMs: number | null = null;
  private bootstrapCompletedAtMs: number | null = null;
  private firstRequest: FirstRequestRecord | null = null;

  private peakRssBytes = 0;
  private peakHeapUsedBytes = 0;
  private peakRssAtMs: number | null = null;
  private memorySamples = 0;
  private memoryIntervalHandle: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    this.sampleMemory();

    this.memoryIntervalHandle = setInterval(() => {
      this.sampleMemory();
    }, MEMORY_SAMPLE_INTERVAL_MS);

    // Don't hold the event loop open purely for telemetry.
    this.memoryIntervalHandle.unref?.();
  }

  onModuleDestroy(): void {
    if (this.memoryIntervalHandle !== null) {
      clearInterval(this.memoryIntervalHandle);
      this.memoryIntervalHandle = null;
    }
  }

  /**
   * Record a memory sample, updating high-water marks.
   * Public so pipeline code can force a sample at a known-peak moment
   * (e.g. immediately after a PDF buffer is materialised).
   */
  sampleMemory(): void {
    const usage = process.memoryUsage();
    this.memorySamples += 1;

    if (usage.rss > this.peakRssBytes) {
      this.peakRssBytes = usage.rss;
      this.peakRssAtMs = Date.now();
    }
    if (usage.heapUsed > this.peakHeapUsedBytes) {
      this.peakHeapUsedBytes = usage.heapUsed;
    }
  }

  getMemoryHighWater(): MemoryHighWater {
    return {
      peakRssMb: toMb(this.peakRssBytes),
      peakHeapUsedMb: toMb(this.peakHeapUsedBytes),
      peakRssAt: this.peakRssAtMs === null ? null : new Date(this.peakRssAtMs).toISOString(),
      currentRssMb: toMb(process.memoryUsage().rss),
      samples: this.memorySamples,
    };
  }

  /** Reset high-water marks — used to isolate a single pipeline run. */
  resetMemoryHighWater(): void {
    this.peakRssBytes = 0;
    this.peakHeapUsedBytes = 0;
    this.peakRssAtMs = null;
    this.memorySamples = 0;
    this.sampleMemory();
  }

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
