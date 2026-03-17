"use client";

import type { AdminQuoteDetail } from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminQuotesQueryKeys } from "./useAdminQuotes";

type FetchAdminQuoteDetailInput = {
  quoteId: string;
  signal?: AbortSignal;
};

export async function fetchAdminQuoteDetail({
  quoteId,
  signal,
}: FetchAdminQuoteDetailInput): Promise<AdminQuoteDetail> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}`, {
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

    throw new Error("Unable to load admin quote details right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin quote details");
  }

  return (await response.json()) as AdminQuoteDetail;
}

type UseAdminQuoteDetailInput = {
  quoteId?: string | null;
  enabled?: boolean;
};

export function useAdminQuoteDetail({ quoteId, enabled = true }: UseAdminQuoteDetailInput) {
  const normalizedQuoteId = quoteId?.trim() ?? "";

  const query = useQuery({
    queryKey: adminQuotesQueryKeys.detail(normalizedQuoteId),
    meta: {
      sentryName: "fetchAdminQuoteDetail",
      sentryEndpoint: "/api/v1/admin/quotes/:id",
    },
    queryFn: ({ signal }) =>
      fetchAdminQuoteDetail({
        quoteId: normalizedQuoteId,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && normalizedQuoteId.length > 0,
  });

  return {
    ...query,
    data: query.data ?? null,
    quote: query.data ?? null,
    isInitialLoading: query.isPending && !query.data,
    isTransitioning: query.isFetching && query.isPlaceholderData,
  };
}
