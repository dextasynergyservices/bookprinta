"use client";

import type {
  AdminOrderDisplayStatus,
  AdminOrderSortField,
  AdminOrdersListResponse,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import {
  ADMIN_ORDERS_LIMIT,
  DEFAULT_ADMIN_ORDER_SORT_BY,
  DEFAULT_ADMIN_ORDER_SORT_DIRECTION,
} from "./use-admin-orders-filters";

export type AdminOrdersQueryInput = {
  cursor?: string;
  limit?: number;
  status?: AdminOrderDisplayStatus | "";
  packageId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  sortBy?: AdminOrderSortField;
  sortDirection?: "asc" | "desc";
};

function createEmptyAdminOrdersResponse(
  limit = ADMIN_ORDERS_LIMIT,
  sortBy: AdminOrderSortField = DEFAULT_ADMIN_ORDER_SORT_BY,
  sortDirection: "asc" | "desc" = DEFAULT_ADMIN_ORDER_SORT_DIRECTION
): AdminOrdersListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit,
    sortBy,
    sortDirection,
    sortableFields: [
      "orderNumber",
      "customerName",
      "customerEmail",
      "packageName",
      "displayStatus",
      "createdAt",
      "totalAmount",
    ],
  };
}

export const adminOrdersQueryKeys = {
  all: ["admin", "orders"] as const,
  list: (input: Required<AdminOrdersQueryInput>) =>
    [
      "admin",
      "orders",
      input.cursor,
      input.limit,
      input.status,
      input.packageId,
      input.dateFrom,
      input.dateTo,
      input.q,
      input.sortBy,
      input.sortDirection,
    ] as const,
  detail: (orderId: string) => ["admin", "orders", "detail", orderId] as const,
};

function resolveQueryInput(input: AdminOrdersQueryInput): Required<AdminOrdersQueryInput> {
  return {
    cursor: input.cursor?.trim() || "",
    limit: input.limit ?? ADMIN_ORDERS_LIMIT,
    status: input.status ?? "",
    packageId: input.packageId?.trim() || "",
    dateFrom: input.dateFrom?.trim() || "",
    dateTo: input.dateTo?.trim() || "",
    q: input.q?.trim() || "",
    sortBy: input.sortBy ?? DEFAULT_ADMIN_ORDER_SORT_BY,
    sortDirection: input.sortDirection ?? DEFAULT_ADMIN_ORDER_SORT_DIRECTION,
  };
}

export async function fetchAdminOrders(
  input: AdminOrdersQueryInput & { signal?: AbortSignal } = {}
): Promise<AdminOrdersListResponse> {
  const query = resolveQueryInput(input);
  const params = new URLSearchParams({
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.status) params.set("status", query.status);
  if (query.packageId) params.set("packageId", query.packageId);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.q) params.set("q", query.q);

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/orders?${params.toString()}`, {
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

    throw new Error("Unable to load admin orders right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin orders");
  }

  return (await response.json()) as AdminOrdersListResponse;
}

export function useAdminOrders(input: AdminOrdersQueryInput) {
  const queryInput = resolveQueryInput(input);

  const query = useQuery({
    queryKey: adminOrdersQueryKeys.list(queryInput),
    meta: {
      sentryName: "fetchAdminOrders",
      sentryEndpoint: "/api/v1/admin/orders",
    },
    queryFn: ({ signal }) =>
      fetchAdminOrders({
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
    createEmptyAdminOrdersResponse(queryInput.limit, queryInput.sortBy, queryInput.sortDirection);

  return {
    ...query,
    data,
    items: data.items,
    isInitialLoading: query.isPending && !query.data,
    isPageTransitioning: query.isFetching && query.isPlaceholderData,
  };
}
