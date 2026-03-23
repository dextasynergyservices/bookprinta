"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { normalizeUserBooksListPayload } from "@/lib/api/books-contract";
import { throwApiError } from "@/lib/api-error";
import { dashboardStatusPollingQueryOptions } from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function coercePage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PAGE;
  return Math.max(1, Math.trunc(value));
}

function coercePageSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(value)));
}

export const userBooksQueryKeys = {
  all: ["user-books"] as const,
  list: (page: number, pageSize: number) => ["user-books", "list", page, pageSize] as const,
};

type FetchUserBooksPageParams = {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export async function fetchUserBooksPage({
  page: requestedPage,
  pageSize: requestedPageSize,
  signal,
}: FetchUserBooksPageParams = {}) {
  const page = coercePage(requestedPage);
  const pageSize = coercePageSize(requestedPageSize);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/books?${params.toString()}`, {
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

    throw new Error("Unable to load your books right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your books");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeUserBooksListPayload(payload, {
    requestedPage: page,
    requestedPageSize: pageSize,
  });
}

type UseUserBooksParams = {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
};

export function useUserBooks({ page, pageSize, enabled = true }: UseUserBooksParams = {}) {
  const resolvedPage = coercePage(page);
  const resolvedPageSize = coercePageSize(pageSize);

  const query = useQuery({
    queryKey: userBooksQueryKeys.list(resolvedPage, resolvedPageSize),
    meta: {
      sentryName: "fetchUserBooks",
      sentryEndpoint: "/api/v1/books",
    },
    queryFn: ({ signal }) =>
      fetchUserBooksPage({
        page: resolvedPage,
        pageSize: resolvedPageSize,
        signal,
      }),
    placeholderData: keepPreviousData,
    ...dashboardStatusPollingQueryOptions,
    enabled,
  });

  const data = query.data ?? normalizeUserBooksListPayload(null);
  const isInitialLoading = query.isPending && !query.data;
  const isPageTransitioning = query.isFetching && query.isPlaceholderData;

  return {
    ...query,
    data,
    items: data.items,
    pagination: data.pagination,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    isInitialLoading,
    isPageTransitioning,
  };
}
