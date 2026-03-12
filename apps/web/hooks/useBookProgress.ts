"use client";

import { useQuery } from "@tanstack/react-query";
import { normalizeBookProgressPayload } from "@/lib/api/book-progress-contract";
import { throwApiError } from "@/lib/api-error";
import {
  BOOK_PROGRESS_STAGES,
  type BookProcessingState,
  type BookProgressNormalizedResponse,
  type BookRolloutState,
} from "@/types/book-progress";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export interface ApproveBookInput {
  bookId: string;
  gateSnapshot?: string;
}

export interface ApproveBookResponse {
  bookId: string;
  bookStatus: string;
  orderStatus: string;
  queuedJob: {
    queue: "pdf-generation";
    name: "generate-pdf";
    jobId: string | null;
  };
}

export interface ReprocessBookResponse {
  bookId: string;
  bookStatus: string;
  orderStatus: string;
  queuedJob: {
    queue: "ai-formatting";
    name: "format-manuscript";
    jobId: string | null;
  };
}

function createFallbackRollout(): BookRolloutState {
  return {
    environment: "unknown",
    allowInFlightAccess: true,
    isGrandfathered: false,
    blockedBy: null,
    workspace: { enabled: true, access: "enabled" },
    manuscriptPipeline: { enabled: true, access: "enabled" },
    billingGate: { enabled: true, access: "enabled" },
    finalPdf: { enabled: true, access: "enabled" },
  };
}

function createFallbackProcessing(): BookProcessingState {
  return {
    isActive: false,
    currentStep: null,
    jobStatus: null,
    trigger: null,
    startedAt: null,
    attempt: null,
    maxAttempts: null,
  };
}

function createFallbackBookProgress(bookId: string | null): BookProgressNormalizedResponse {
  return {
    sourceEndpoint: "books_detail",
    bookId,
    orderId: null,
    currentStatus: null,
    productionStatus: "PAYMENT_RECEIVED",
    latestProcessingError: null,
    rejectionReason: null,
    currentStage: "PAYMENT_RECEIVED",
    isRejected: false,
    timeline: BOOK_PROGRESS_STAGES.map((stage, index) => ({
      stage,
      state: index === 0 ? "current" : "upcoming",
      reachedAt: null,
      sourceStatus: null,
    })),
    title: null,
    coverImageUrl: null,
    pageCount: null,
    wordCount: null,
    estimatedPages: null,
    fontFamily: null,
    fontSize: null,
    pageSize: null,
    currentHtmlUrl: null,
    previewPdfUrl: null,
    finalPdfUrl: null,
    updatedAt: null,
    rollout: createFallbackRollout(),
    processing: createFallbackProcessing(),
  };
}

function resolveBookId(bookId: string | null | undefined): string | null {
  if (typeof bookId !== "string") return null;
  const normalized = bookId.trim();
  return normalized.length > 0 ? normalized : null;
}

export const bookProgressQueryKeys = {
  all: ["book-progress"] as const,
  detail: (bookId: string) => ["book-progress", "detail", bookId] as const,
};

type FetchBookProgressParams = {
  bookId: string;
  signal?: AbortSignal;
};

export async function fetchBookProgress({
  bookId: requestedBookId,
  signal,
}: FetchBookProgressParams): Promise<BookProgressNormalizedResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/books/${requestedBookId}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (errorName.toLowerCase().includes("abort")) {
      throw error;
    }

    throw new Error("Unable to load your book progress right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your book progress");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const normalized = normalizeBookProgressPayload(payload);

  return {
    ...normalized,
    bookId: normalized.bookId ?? requestedBookId,
  };
}

export async function approveBookForProduction({
  bookId,
  gateSnapshot,
}: ApproveBookInput): Promise<ApproveBookResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/books/${encodeURIComponent(bookId)}/approve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gateSnapshot ? { gateSnapshot } : {}),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to approve your book right now");
  }

  return (await response.json()) as ApproveBookResponse;
}

export async function reprocessBookManuscript(bookId: string): Promise<ReprocessBookResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/books/${encodeURIComponent(bookId)}/reprocess`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to retry manuscript processing right now");
  }

  return (await response.json()) as ReprocessBookResponse;
}

type UseBookProgressParams = {
  bookId?: string | null;
  enabled?: boolean;
};

export function useBookProgress({ bookId, enabled = true }: UseBookProgressParams) {
  const resolvedBookId = resolveBookId(bookId);
  const fallbackData = createFallbackBookProgress(resolvedBookId);

  const query = useQuery({
    queryKey: resolvedBookId
      ? bookProgressQueryKeys.detail(resolvedBookId)
      : bookProgressQueryKeys.all,
    meta: {
      sentryName: "fetchBookProgress",
      sentryEndpoint: "/api/v1/books/:id",
    },
    queryFn: ({ signal }) => {
      if (!resolvedBookId) {
        return Promise.resolve(fallbackData);
      }

      return fetchBookProgress({
        bookId: resolvedBookId,
        signal,
      });
    },
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && Boolean(resolvedBookId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data ?? fallbackData;
  const isInitialLoading = query.isPending && !query.data;

  return {
    ...query,
    data,
    bookId: data.bookId ?? resolvedBookId,
    orderId: data.orderId,
    currentStatus: data.currentStatus,
    productionStatus: data.productionStatus,
    latestProcessingError: data.latestProcessingError,
    currentStage: data.currentStage,
    rejectionReason: data.rejectionReason,
    timeline: data.timeline,
    isRejected: data.isRejected,
    sourceEndpoint: data.sourceEndpoint,
    title: data.title,
    coverImageUrl: data.coverImageUrl,
    pageCount: data.pageCount,
    wordCount: data.wordCount,
    estimatedPages: data.estimatedPages,
    fontFamily: data.fontFamily,
    fontSize: data.fontSize,
    pageSize: data.pageSize,
    currentHtmlUrl: data.currentHtmlUrl,
    previewPdfUrl: data.previewPdfUrl,
    finalPdfUrl: data.finalPdfUrl,
    updatedAt: data.updatedAt,
    rollout: data.rollout,
    processing: data.processing,
    isInitialLoading,
  };
}
