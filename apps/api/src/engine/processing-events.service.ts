import { EventEmitter } from "node:events";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { RedisService } from "../redis/redis.service.js";

// ─── Event Types ──────────────────────────────────────────────

export type ProcessingProgressEvent = {
  type: "progress";
  step: string;
  chunkProgress?: string;
  estimatedSecondsRemaining?: number;
  estimatedPages?: number;
  partialPreviewUrl?: string;
  pageCount?: number;
  gateStatus?: "CLEAR" | "PAYMENT_REQUIRED";
};

export type ProcessingCompleteEvent = {
  type: "complete";
  pageCount: number | null;
  previewUrl: string | null;
  gateStatus: "CLEAR" | "PAYMENT_REQUIRED" | null;
};

export type ProcessingErrorEvent = {
  type: "error";
  message: string;
  retryable: boolean;
};

export type ProcessingEvent =
  | ProcessingProgressEvent
  | ProcessingCompleteEvent
  | ProcessingErrorEvent;

// ─── Channel helpers ──────────────────────────────────────────

function channelName(bookId: string): string {
  return `book-processing:${bookId}`;
}

/**
 * Key under which the last terminal event (complete/error) is cached.
 * Allows reconnecting clients to receive the final state immediately.
 */
const PROCESSING_SNAPSHOT_TTL_SECONDS = 7_200; // 2 hours

function snapshotKey(bookId: string): string {
  return `bp:processing-snapshot:${bookId}`;
}

// ─── Service ──────────────────────────────────────────────────

/**
 * ProcessingEventsService — Pub/sub bridge between BullMQ job processors and
 * SSE connections.
 *
 * Publishers (job processors) call `emit(bookId, event)` to broadcast events
 * via Redis pub/sub.
 *
 * Subscribers (SSE controller) call `subscribe(bookId, handler)` which registers
 * a local EventEmitter listener. A **single shared** ioredis connection
 * pattern-subscribes to `book-processing:*` and fans out messages in-process,
 * keeping the Redis connection count at 1 per server process regardless of how
 * many concurrent SSE clients are open.
 */
@Injectable()
export class ProcessingEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessingEventsService.name);

  /**
   * A single shared ioredis subscriber connection per process.
   * Pattern-subscribes to `book-processing:*` and fans out to the local
   * EventEmitter — reducing Redis connections from N-per-user to 1.
   */
  private sharedSubscriber: Redis | null = null;
  /** Pending initialisation promise — prevents concurrent duplicate() calls. */
  private sharedSubscriberInitPromise: Promise<void> | null = null;
  /**
   * In-process fan-out bus. Each SSE client gets an EventEmitter listener
   * instead of its own Redis subscriber connection.
   * setMaxListeners(0) disables the default-10 warning for high-concurrency.
   */
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  constructor(private readonly redis: RedisService) {}

  /**
   * Publish a processing event for a book. Called from job processors.
   * Silently no-ops if Redis is unavailable.
   */
  async emit(bookId: string, event: ProcessingEvent): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      const channel = channelName(bookId);
      await client.publish(channel, JSON.stringify(event));

      // Cache terminal events so reconnecting clients get the final state immediately
      if (event.type === "complete" || event.type === "error") {
        await client.set(
          snapshotKey(bookId),
          JSON.stringify(event),
          "EX",
          PROCESSING_SNAPSHOT_TTL_SECONDS
        );
      }
    } catch (error) {
      this.logger.debug?.(`Failed to publish processing event for book ${bookId}: ${error}`);
    }
  }

  /**
   * Subscribe to processing events for a specific book.
   *
   * Uses a **single shared** ioredis subscriber (pattern `book-processing:*`)
   * instead of one `duplicate()` per SSE client. Events are fanned out via a
   * local EventEmitter, keeping Redis connection count at 1 per process regardless
   * of how many concurrent SSE clients are connected.
   *
   * Returns null only when Redis is unavailable (caller should fall back to polling).
   */
  subscribe(
    bookId: string,
    handler: (event: ProcessingEvent) => void
  ): { unsubscribe: () => void } | null {
    const client = this.redis.getClient();
    if (!client) return null;

    const channel = channelName(bookId);

    // Wrap the raw message string into a typed event and forward to the caller.
    const listener = (message: string) => {
      try {
        const event = JSON.parse(message) as ProcessingEvent;
        handler(event);
      } catch {
        // Malformed Redis message — ignore
      }
    };
    this.emitter.on(channel, listener);

    // Lazily create the single shared pattern-subscriber (concurrent calls are
    // de-duplicated via the pending-promise guard in ensureSharedSubscriber).
    void this.ensureSharedSubscriber(client);

    return {
      unsubscribe: () => {
        this.emitter.off(channel, listener);
      },
    };
  }

  /**
   * Ensures the shared pattern-subscriber exists, creating it exactly once.
   * Concurrent callers receive the same in-flight Promise.
   */
  private ensureSharedSubscriber(client: Redis): Promise<void> {
    if (this.sharedSubscriber) return Promise.resolve();
    if (this.sharedSubscriberInitPromise) return this.sharedSubscriberInitPromise;

    this.sharedSubscriberInitPromise = this._initSharedSubscriber(client).catch((error) => {
      this.logger.warn(`Failed to initialise shared Redis subscriber: ${error}`);
      // Allow a retry on the next subscribe() call
      this.sharedSubscriberInitPromise = null;
    });

    return this.sharedSubscriberInitPromise;
  }

  private async _initSharedSubscriber(client: Redis): Promise<void> {
    const sub = client.duplicate();
    await sub.psubscribe("book-processing:*");

    sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
      this.emitter.emit(channel, message);
    });

    sub.on("error", (error: Error) => {
      this.logger.warn(`Shared Redis subscriber error: ${error.message}`);
      // Reset so the next subscribe() call attempts a fresh connection
      if (this.sharedSubscriber === sub) {
        this.sharedSubscriber = null;
        this.sharedSubscriberInitPromise = null;
        try {
          sub.disconnect();
        } catch {
          // ignore
        }
      }
    });

    this.sharedSubscriber = sub;
  }

  /**
   * Returns the cached terminal event for a book, or null if none exists.
   * Used by the SSE handler to immediately replay the final state to reconnected clients.
   */
  async getSnapshot(
    bookId: string
  ): Promise<ProcessingCompleteEvent | ProcessingErrorEvent | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    try {
      const raw = await client.get(snapshotKey(bookId));
      if (!raw) return null;
      const event = JSON.parse(raw) as ProcessingEvent;
      if (event.type === "complete" || event.type === "error") {
        return event;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Convenience: check if Redis pub/sub is available.
   */
  isAvailable(): boolean {
    return this.redis.isAvailable();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sharedSubscriber) {
      try {
        this.sharedSubscriber.disconnect();
      } catch {
        // best-effort cleanup
      }
      this.sharedSubscriber = null;
    }
    this.sharedSubscriberInitPromise = null;
    this.emitter.removeAllListeners();
  }
}
