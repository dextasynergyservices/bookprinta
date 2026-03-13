"use client";

import type { BookReprintConfigResponse } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { normalizeBookReprintConfigPayload } from "@/lib/api/book-reprint-contract";
import { throwApiError } from "@/lib/api-error";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function resolveBookId(bookId: string | null | undefined): string | null {
  if (typeof bookId !== "string") return null;
  const normalized = bookId.trim();
  return normalized.length > 0 ? normalized : null;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function createFallbackBookReprintConfig(bookId: string): BookReprintConfigResponse {
  return {
    bookId,
    canReprintSame: false,
    disableReason: null,
    finalPdfUrlPresent: false,
    pageCount: null,
    minCopies: 25,
    defaultBookSize: "A5",
    defaultPaperColor: "white",
    defaultLamination: "gloss",
    allowedBookSizes: ["A4", "A5", "A6"],
    allowedPaperColors: ["white", "cream"],
    allowedLaminations: ["matt", "gloss"],
    costPerPageBySize: {
      A4: 0,
      A5: 0,
      A6: 0,
    },
    enabledPaymentProviders: [],
  };
}

export const bookReprintConfigQueryKeys = {
  all: ["book-reprint-config"] as const,
  detail: (bookId: string) => ["book-reprint-config", "detail", bookId] as const,
};

type FetchBookReprintConfigParams = {
  bookId: string;
  signal?: AbortSignal;
};

export async function fetchBookReprintConfig({
  bookId,
  signal,
}: FetchBookReprintConfigParams): Promise<BookReprintConfigResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${API_V1_BASE_URL}/books/${encodeURIComponent(bookId)}/reprint-config`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal,
      }
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load your reprint settings right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your reprint settings");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeBookReprintConfigPayload(payload);
}

type UseBookReprintConfigParams = {
  bookId?: string | null;
  enabled?: boolean;
};

export function useBookReprintConfig({ bookId, enabled = true }: UseBookReprintConfigParams) {
  const resolvedBookId = resolveBookId(bookId);
  const fallbackData = resolvedBookId ? createFallbackBookReprintConfig(resolvedBookId) : null;

  const query = useQuery({
    queryKey: resolvedBookId
      ? bookReprintConfigQueryKeys.detail(resolvedBookId)
      : bookReprintConfigQueryKeys.all,
    meta: {
      sentryName: "fetchBookReprintConfig",
      sentryEndpoint: "/api/v1/books/:id/reprint-config",
    },
    queryFn: ({ signal }) => {
      if (!resolvedBookId) {
        throw new Error("Book id is required to load reprint settings");
      }

      return fetchBookReprintConfig({
        bookId: resolvedBookId,
        signal,
      });
    },
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && Boolean(resolvedBookId),
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    data: query.data ?? fallbackData,
    config: query.data ?? fallbackData,
    isInitialLoading: query.isPending && !query.data,
  };
}
