"use client";

import type {
  AdminBookDisplayStatus,
  AdminBookSortField,
  AdminBooksListResponse,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import {
  ADMIN_BOOKS_LIMIT,
  DEFAULT_ADMIN_BOOK_SORT_BY,
  DEFAULT_ADMIN_BOOK_SORT_DIRECTION,
} from "./use-admin-books-filters";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export type AdminBooksQueryInput = {
  cursor?: string;
  limit?: number;
  status?: AdminBookDisplayStatus | "";
  sortBy?: AdminBookSortField;
  sortDirection?: "asc" | "desc";
};

function createEmptyAdminBooksResponse(
  limit = ADMIN_BOOKS_LIMIT,
  sortBy: AdminBookSortField = DEFAULT_ADMIN_BOOK_SORT_BY,
  sortDirection: "asc" | "desc" = DEFAULT_ADMIN_BOOK_SORT_DIRECTION
): AdminBooksListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit,
    sortBy,
    sortDirection,
    sortableFields: ["title", "authorName", "displayStatus", "orderNumber", "uploadedAt"],
  };
}

export const adminBooksQueryKeys = {
  all: ["admin", "books"] as const,
  list: (input: Required<AdminBooksQueryInput>) =>
    [
      "admin",
      "books",
      input.cursor,
      input.limit,
      input.status,
      input.sortBy,
      input.sortDirection,
    ] as const,
  detail: (bookId: string) => ["admin", "books", "detail", bookId] as const,
};

function resolveQueryInput(input: AdminBooksQueryInput): Required<AdminBooksQueryInput> {
  return {
    cursor: input.cursor?.trim() || "",
    limit: input.limit ?? ADMIN_BOOKS_LIMIT,
    status: input.status ?? "",
    sortBy: input.sortBy ?? DEFAULT_ADMIN_BOOK_SORT_BY,
    sortDirection: input.sortDirection ?? DEFAULT_ADMIN_BOOK_SORT_DIRECTION,
  };
}

export async function fetchAdminBooks(
  input: AdminBooksQueryInput & { signal?: AbortSignal } = {}
): Promise<AdminBooksListResponse> {
  const query = resolveQueryInput(input);
  const params = new URLSearchParams({
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.status) params.set("status", query.status);

  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/admin/books?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (errorName.toLowerCase().includes("abort")) {
      throw error;
    }

    throw new Error("Unable to load admin books right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin books");
  }

  return (await response.json()) as AdminBooksListResponse;
}

export function useAdminBooks(input: AdminBooksQueryInput) {
  const queryInput = resolveQueryInput(input);

  const query = useQuery({
    queryKey: adminBooksQueryKeys.list(queryInput),
    meta: {
      sentryName: "fetchAdminBooks",
      sentryEndpoint: "/api/v1/admin/books",
    },
    queryFn: ({ signal }) =>
      fetchAdminBooks({
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
    createEmptyAdminBooksResponse(queryInput.limit, queryInput.sortBy, queryInput.sortDirection);

  return {
    ...query,
    data,
    items: data.items,
    isInitialLoading: query.isPending && !query.data,
    isPageTransitioning: query.isFetching && query.isPlaceholderData,
  };
}
