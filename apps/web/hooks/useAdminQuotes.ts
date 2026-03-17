"use client";

import type {
  AdminQuoteListStatus,
  AdminQuoteSortField,
  AdminQuotesListResponse,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import {
  ADMIN_QUOTES_LIMIT,
  DEFAULT_ADMIN_QUOTES_SORT_BY,
  DEFAULT_ADMIN_QUOTES_SORT_DIRECTION,
} from "./use-admin-quotes-filters";

const ADMIN_QUOTES_FETCH_TIMEOUT_MS = 15_000;

export type AdminQuotesQueryInput = {
  cursor?: string;
  limit?: number;
  status?: AdminQuoteListStatus | "";
  q?: string;
  sortBy?: AdminQuoteSortField;
  sortDirection?: "asc" | "desc";
};

function createEmptyAdminQuotesResponse(
  limit = ADMIN_QUOTES_LIMIT,
  sortBy: AdminQuoteSortField = DEFAULT_ADMIN_QUOTES_SORT_BY,
  sortDirection: "asc" | "desc" = DEFAULT_ADMIN_QUOTES_SORT_DIRECTION
): AdminQuotesListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit,
    sortBy,
    sortDirection,
    sortableFields: [
      "createdAt",
      "updatedAt",
      "fullName",
      "email",
      "workingTitle",
      "bookPrintSize",
      "quantity",
      "status",
      "finalPrice",
    ],
  };
}

export const adminQuotesQueryKeys = {
  all: ["admin", "quotes"] as const,
  lists: () => ["admin", "quotes", "list"] as const,
  list: (input: Required<AdminQuotesQueryInput>) =>
    [
      "admin",
      "quotes",
      "list",
      input.cursor,
      input.limit,
      input.status,
      input.q,
      input.sortBy,
      input.sortDirection,
    ] as const,
  detail: (quoteId: string) => ["admin", "quotes", "detail", quoteId] as const,
};

function resolveQueryInput(input: AdminQuotesQueryInput): Required<AdminQuotesQueryInput> {
  return {
    cursor: input.cursor?.trim() || "",
    limit: input.limit ?? ADMIN_QUOTES_LIMIT,
    status: input.status ?? "",
    q: input.q?.trim() || "",
    sortBy: input.sortBy ?? DEFAULT_ADMIN_QUOTES_SORT_BY,
    sortDirection: input.sortDirection ?? DEFAULT_ADMIN_QUOTES_SORT_DIRECTION,
  };
}

export async function fetchAdminQuotes(
  input: AdminQuotesQueryInput & { signal?: AbortSignal } = {}
): Promise<AdminQuotesListResponse> {
  const query = resolveQueryInput(input);
  const params = new URLSearchParams({
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);

  let response: Response;
  let didTimeout = false;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, ADMIN_QUOTES_FETCH_TIMEOUT_MS);

  const abortOnCallerSignal = () => {
    controller.abort();
  };

  if (input.signal) {
    if (input.signal.aborted) {
      globalThis.clearTimeout(timeoutId);
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    input.signal.addEventListener("abort", abortOnCallerSignal, {
      once: true,
    });
  }

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    globalThis.clearTimeout(timeoutId);
    if (input.signal) {
      input.signal.removeEventListener("abort", abortOnCallerSignal);
    }

    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (didTimeout) {
      throw new Error("Admin quotes request timed out. Please retry.");
    }

    if (errorName.toLowerCase().includes("abort")) {
      throw error;
    }

    throw new Error("Unable to load admin quotes right now.");
  }

  globalThis.clearTimeout(timeoutId);
  if (input.signal) {
    input.signal.removeEventListener("abort", abortOnCallerSignal);
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin quotes");
  }

  return (await response.json()) as AdminQuotesListResponse;
}

export function useAdminQuotes(input: AdminQuotesQueryInput) {
  const queryInput = resolveQueryInput(input);

  const query = useQuery({
    queryKey: adminQuotesQueryKeys.list(queryInput),
    meta: {
      sentryName: "fetchAdminQuotes",
      sentryEndpoint: "/api/v1/admin/quotes",
    },
    queryFn: ({ signal }) =>
      fetchAdminQuotes({
        ...queryInput,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data =
    query.data ??
    createEmptyAdminQuotesResponse(queryInput.limit, queryInput.sortBy, queryInput.sortDirection);

  return {
    ...query,
    data,
    items: data.items,
    isInitialLoading: query.isPending && !query.data,
    isPageTransitioning: query.isFetching && query.isPlaceholderData,
  };
}
