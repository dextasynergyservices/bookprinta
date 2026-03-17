"use client";

import type { AdminBookDetail } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminBooksQueryKeys } from "./useAdminBooks";

type FetchAdminBookDetailInput = {
  bookId: string;
  signal?: AbortSignal;
};

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

export async function fetchAdminBookDetail({
  bookId,
  signal,
}: FetchAdminBookDetailInput): Promise<AdminBookDetail> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load admin book details right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin book details");
  }

  return (await response.json()) as AdminBookDetail;
}

type UseAdminBookDetailInput = {
  bookId?: string | null;
  enabled?: boolean;
};

export function useAdminBookDetail({ bookId, enabled = true }: UseAdminBookDetailInput) {
  const normalizedBookId = bookId?.trim() ?? "";

  const query = useQuery({
    queryKey: adminBooksQueryKeys.detail(normalizedBookId),
    meta: {
      sentryName: "fetchAdminBookDetail",
      sentryEndpoint: "/api/v1/admin/books/:id",
    },
    queryFn: ({ signal }) =>
      fetchAdminBookDetail({
        bookId: normalizedBookId,
        signal,
      }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && normalizedBookId.length > 0,
  });

  return {
    ...query,
    data: query.data ?? null,
    book: query.data ?? null,
    isInitialLoading: query.isPending && !query.data,
  };
}
