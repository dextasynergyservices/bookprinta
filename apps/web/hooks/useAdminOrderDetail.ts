"use client";

import type { AdminOrderDetail } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminOrdersQueryKeys } from "./useAdminOrders";

type FetchAdminOrderDetailInput = {
  orderId: string;
  signal?: AbortSignal;
};

export async function fetchAdminOrderDetail({
  orderId,
  signal,
}: FetchAdminOrderDetailInput): Promise<AdminOrderDetail> {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/orders/${orderId}`, {
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

    throw new Error("Unable to load admin order details right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin order details");
  }

  return (await response.json()) as AdminOrderDetail;
}

type UseAdminOrderDetailInput = {
  orderId?: string | null;
  enabled?: boolean;
};

export function useAdminOrderDetail({ orderId, enabled = true }: UseAdminOrderDetailInput) {
  const normalizedOrderId = orderId?.trim() ?? "";

  const query = useQuery({
    queryKey: adminOrdersQueryKeys.detail(normalizedOrderId),
    meta: {
      sentryName: "fetchAdminOrderDetail",
      sentryEndpoint: "/api/v1/admin/orders/:id",
    },
    queryFn: ({ signal }) =>
      fetchAdminOrderDetail({
        orderId: normalizedOrderId,
        signal,
      }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && normalizedOrderId.length > 0,
  });

  return {
    ...query,
    data: query.data ?? null,
    order: query.data ?? null,
    isInitialLoading: query.isPending && !query.data,
  };
}
