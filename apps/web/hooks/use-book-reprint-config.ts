"use client";

import type { BookReprintConfigResponse } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { normalizeBookReprintConfigPayload } from "@/lib/api/book-reprint-contract";
import { throwApiError } from "@/lib/api-error";
import {
  DASHBOARD_STATUS_STALE_TIME_MS,
  dashboardBaseQueryOptions,
} from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

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
    hasActiveReprint: false,
    finalPdfUrlPresent: false,
    pageCount: null,
    costPerCopy: null,
    bookTitle: null,
    bookSize: null,
    paperColor: null,
    lamination: null,
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
    response = await fetchApiV1WithRefresh(`/books/${encodeURIComponent(bookId)}/reprint-config`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
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
    ...dashboardBaseQueryOptions,
    staleTime: DASHBOARD_STATUS_STALE_TIME_MS,
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
