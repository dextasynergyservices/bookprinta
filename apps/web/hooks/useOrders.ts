"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { normalizeOrdersListPayload } from "@/lib/api/orders-contract";
import { throwApiError } from "@/lib/api-error";
import { dashboardHistoryQueryOptions } from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import type { OrdersListNormalizedResponse } from "@/types/orders";

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

function createEmptyOrdersResponse(page: number, pageSize: number): OrdersListNormalizedResponse {
  return {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: page > 1,
      hasNextPage: false,
      nextCursor: null,
    },
  };
}

export const ordersQueryKeys = {
  all: ["orders"] as const,
  list: (page: number, pageSize: number) => ["orders", "list", page, pageSize] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
  tracking: (orderId: string) => ["orders", "tracking", orderId] as const,
};

type FetchOrdersPageParams = {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export async function fetchOrdersPage({
  page: requestedPage,
  pageSize: requestedPageSize,
  signal,
}: FetchOrdersPageParams = {}): Promise<OrdersListNormalizedResponse> {
  const page = coercePage(requestedPage);
  const pageSize = coercePageSize(requestedPageSize);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/orders?${params.toString()}`, {
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

    throw new Error("Unable to load your orders right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your orders");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const normalized = normalizeOrdersListPayload(payload, {
    requestedPage: page,
    requestedPageSize: pageSize,
  });

  if (normalized.items.length === 0 && normalized.pagination.totalItems === null) {
    return createEmptyOrdersResponse(page, pageSize);
  }

  return normalized;
}

type UseOrdersParams = {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
};

export function useOrders({ page, pageSize, enabled = true }: UseOrdersParams = {}) {
  const resolvedPage = coercePage(page);
  const resolvedPageSize = coercePageSize(pageSize);

  const query = useQuery({
    queryKey: ordersQueryKeys.list(resolvedPage, resolvedPageSize),
    meta: {
      sentryName: "fetchOrders",
      sentryEndpoint: "/api/v1/orders",
    },
    queryFn: ({ signal }) =>
      fetchOrdersPage({
        page: resolvedPage,
        pageSize: resolvedPageSize,
        signal,
      }),
    placeholderData: keepPreviousData,
    ...dashboardHistoryQueryOptions,
    enabled,
  });

  const data = query.data ?? createEmptyOrdersResponse(resolvedPage, resolvedPageSize);
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
