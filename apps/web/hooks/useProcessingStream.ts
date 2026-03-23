"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiV1BaseUrl } from "@/lib/fetch-with-refresh";
import type { BookProcessingStep } from "@/types/book-progress";

// ─── SSE Event Types ──────────────────────────────────────

interface SseProgressEvent {
  type: "progress";
  step: string;
  chunkProgress?: string;
  estimatedSecondsRemaining?: number;
  estimatedPages?: number;
  partialPreviewUrl?: string;
}

interface SseCompleteEvent {
  type: "complete";
  pageCount: number | null;
  previewUrl: string | null;
  gateStatus: "CLEAR" | "PAYMENT_REQUIRED" | null;
}

interface SseErrorEvent {
  type: "error";
  message: string;
  retryable: boolean;
}

// ─── Hook Return Type ─────────────────────────────────────

export interface ProcessingStreamState {
  /** The current pipeline step from SSE, or null if no SSE data yet */
  currentStep: BookProcessingStep | null;
  /** Chunk progress string like "2/3", from backend SSE events */
  chunkProgress: string | null;
  /** Server-estimated remaining seconds */
  estimatedSeconds: number | null;
  /** Estimated page count (before authoritative Gotenberg count) */
  estimatedPages: number | null;
  /** URL of partial preview from first AI chunk (available before full processing completes) */
  partialPreviewUrl: string | null;
  /** Processing completed successfully */
  isComplete: boolean;
  /** Completion payload (pageCount, gateStatus, previewUrl) */
  completionData: {
    pageCount: number | null;
    previewUrl: string | null;
    gateStatus: "CLEAR" | "PAYMENT_REQUIRED" | null;
  } | null;
  /** Terminal error from the backend */
  error: { message: string; retryable: boolean } | null;
  /** Whether SSE is connected (false = fallback to polling) */
  isConnected: boolean;
}

// ─── Constants ────────────────────────────────────────────

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Hook ─────────────────────────────────────────────────

/**
 * useProcessingStream — Connects to the SSE endpoint for real-time
 * manuscript processing updates. Falls back gracefully if SSE fails
 * (the caller should continue polling as a fallback).
 *
 * @param bookId - Book CUID to subscribe to
 * @param enabled - Only connect when processing is active
 */
export function useProcessingStream(
  bookId: string | null | undefined,
  enabled: boolean
): ProcessingStreamState {
  const [state, setState] = useState<ProcessingStreamState>({
    currentStep: null,
    chunkProgress: null,
    estimatedSeconds: null,
    estimatedPages: null,
    partialPreviewUrl: null,
    isComplete: false,
    completionData: null,
    error: null,
    isConnected: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const attemptReconnectRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!bookId || !enabledRef.current) return;

    // EventSource is not available in SSR
    if (typeof EventSource === "undefined") return;

    cleanup();

    const apiBase = getApiV1BaseUrl();
    const url = `${apiBase}/books/${encodeURIComponent(bookId)}/processing-stream`;

    // EventSource doesn't support credentials natively in all browsers,
    // but cookies are sent automatically for same-site/CORS-with-credentials requests.
    // For cross-origin, we need to use withCredentials.
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      reconnectAttemptRef.current = 0;
      setState((prev) => ({ ...prev, isConnected: true }));
    });

    es.addEventListener("progress", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SseProgressEvent;
        setState((prev) => ({
          ...prev,
          currentStep: data.step as BookProcessingStep,
          chunkProgress: data.chunkProgress ?? prev.chunkProgress,
          estimatedSeconds: data.estimatedSecondsRemaining ?? prev.estimatedSeconds,
          estimatedPages: data.estimatedPages ?? prev.estimatedPages,
          partialPreviewUrl: data.partialPreviewUrl ?? prev.partialPreviewUrl,
          isComplete: false,
          completionData: null,
          error: null,
          isConnected: true,
        }));
      } catch {
        // Malformed SSE data — ignore
      }
    });

    es.addEventListener("complete", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SseCompleteEvent;
        setState((prev) => ({
          ...prev,
          currentStep: null,
          chunkProgress: null,
          estimatedSeconds: null,
          isComplete: true,
          completionData: {
            pageCount: data.pageCount,
            previewUrl: data.previewUrl,
            gateStatus: data.gateStatus,
          },
          error: null,
          isConnected: false, // Server closes connection after complete
        }));
      } catch {
        // Malformed SSE data — ignore
      }
      cleanup();
    });

    es.addEventListener("error", (event: MessageEvent) => {
      // This is a backend-sent "error" event (not a connection error)
      try {
        const data = JSON.parse(event.data) as SseErrorEvent;
        setState((prev) => ({
          ...prev,
          currentStep: null,
          chunkProgress: null,
          estimatedSeconds: null,
          isComplete: false,
          completionData: null,
          error: { message: data.message, retryable: data.retryable },
          isConnected: false,
        }));
      } catch {
        // Malformed or connection-level error — handled by onerror below
      }
      cleanup();
    });

    es.addEventListener("timeout", () => {
      // Server-side timeout — connection expired, try reconnecting
      cleanup();
      attemptReconnectRef.current?.();
    });

    es.onerror = () => {
      // Connection-level error (network issue, server down, 503, etc.)
      setState((prev) => ({ ...prev, isConnected: false }));
      cleanup();
      attemptReconnectRef.current?.();
    };
  }, [bookId, cleanup]);

  const attemptReconnect = useCallback(() => {
    if (!enabledRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      // Give up — caller's polling fallback takes over
      return;
    }

    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current = attempt + 1;

    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);

    reconnectTimerRef.current = setTimeout(() => {
      if (enabledRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  attemptReconnectRef.current = attemptReconnect;

  // Connect/disconnect based on bookId + enabled
  useEffect(() => {
    if (!bookId || !enabled) {
      cleanup();
      setState({
        currentStep: null,
        chunkProgress: null,
        estimatedSeconds: null,
        estimatedPages: null,
        partialPreviewUrl: null,
        isComplete: false,
        completionData: null,
        error: null,
        isConnected: false,
      });
      reconnectAttemptRef.current = 0;
      return;
    }

    connect();
    return cleanup;
  }, [bookId, enabled, connect, cleanup]);

  return state;
}
