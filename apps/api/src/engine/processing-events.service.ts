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

// ─── Service ──────────────────────────────────────────────────

/**
 * ProcessingEventsService — Pub/sub bridge between BullMQ job processors and
 * SSE connections.
 *
 * Publishers (job processors) call `emit(bookId, event)` to broadcast events
 * via Redis pub/sub.
 *
 * Subscribers (SSE controller) call `subscribe(bookId, handler)` which creates
 * a **dedicated** ioredis subscriber connection (ioredis requires subscriber
 * connections to be used exclusively for subscribe commands).
 *
 * The subscriber connection is created by duplicating the main Redis client.
 * Each SSE connection gets its own subscriber that is cleaned up when the
 * client disconnects.
 */
@Injectable()
export class ProcessingEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessingEventsService.name);
  private readonly subscribers = new Set<Redis>();

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
    } catch (error) {
      this.logger.debug?.(`Failed to publish processing event for book ${bookId}: ${error}`);
    }
  }

  /**
   * Subscribe to processing events for a specific book.
   * Returns an unsubscribe function that closes the dedicated subscriber.
   *
   * Uses a **duplicate** ioredis connection because Redis requires subscriber
   * clients to be in subscribe mode exclusively.
   */
  subscribe(
    bookId: string,
    handler: (event: ProcessingEvent) => void
  ): { unsubscribe: () => void } | null {
    const client = this.redis.getClient();
    if (!client) return null;

    const channel = channelName(bookId);
    const subscriber = client.duplicate();
    this.subscribers.add(subscriber);

    subscriber.subscribe(channel).catch((error) => {
      this.logger.debug?.(`Failed to subscribe to ${channel}: ${error}`);
    });

    subscriber.on("message", (_ch: string, message: string) => {
      if (_ch !== channel) return;
      try {
        const event = JSON.parse(message) as ProcessingEvent;
        handler(event);
      } catch {
        // Malformed message — ignore
      }
    });

    const unsubscribe = () => {
      this.subscribers.delete(subscriber);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
    };

    return { unsubscribe };
  }

  /**
   * Convenience: check if Redis pub/sub is available.
   */
  isAvailable(): boolean {
    return this.redis.isAvailable();
  }

  async onModuleDestroy(): Promise<void> {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.disconnect();
      } catch {
        // best-effort cleanup
      }
    }
    this.subscribers.clear();
  }
}
