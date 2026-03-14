"use client";

import type { AdminUserDetail } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { adminUsersQueryKeys } from "./useAdminUsers";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

const API_V1_BASE_URL = getApiV1BaseUrl();

type FetchAdminUserDetailInput = {
  userId: string;
  signal?: AbortSignal;
};

export async function fetchAdminUserDetail({
  userId,
  signal,
}: FetchAdminUserDetailInput): Promise<AdminUserDetail> {
  let response: Response;

  try {
    response = await fetch(`${API_V1_BASE_URL}/admin/users/${userId}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load admin user details right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin user details");
  }

  return (await response.json()) as AdminUserDetail;
}

type UseAdminUserDetailInput = {
  userId?: string | null;
  enabled?: boolean;
};

export function useAdminUserDetail({ userId, enabled = true }: UseAdminUserDetailInput) {
  const normalizedUserId = userId?.trim() ?? "";

  const query = useQuery({
    queryKey: adminUsersQueryKeys.detail(normalizedUserId),
    meta: {
      sentryName: "fetchAdminUserDetail",
      sentryEndpoint: "/api/v1/admin/users/:id",
    },
    queryFn: ({ signal }) =>
      fetchAdminUserDetail({
        userId: normalizedUserId,
        signal,
      }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && normalizedUserId.length > 0,
  });

  return {
    ...query,
    data: query.data ?? null,
    user: query.data ?? null,
    isInitialLoading: query.isPending && !query.data,
  };
}
