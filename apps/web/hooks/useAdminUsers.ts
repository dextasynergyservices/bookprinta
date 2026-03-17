"use client";

import type { AdminUserSortField, AdminUsersListResponse, UserRoleValue } from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import {
  ADMIN_USERS_LIMIT,
  DEFAULT_ADMIN_USER_SORT_BY,
  DEFAULT_ADMIN_USER_SORT_DIRECTION,
} from "./use-admin-users-filters";

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

export type AdminUsersQueryInput = {
  cursor?: string;
  limit?: number;
  q?: string;
  role?: UserRoleValue | "";
  isVerified?: boolean | "";
  sortBy?: AdminUserSortField;
  sortDirection?: "asc" | "desc";
};

function createEmptyAdminUsersResponse(
  limit = ADMIN_USERS_LIMIT,
  sortBy: AdminUserSortField = DEFAULT_ADMIN_USER_SORT_BY,
  sortDirection: "asc" | "desc" = DEFAULT_ADMIN_USER_SORT_DIRECTION
): AdminUsersListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit,
    sortBy,
    sortDirection,
    sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
  };
}

export const adminUsersQueryKeys = {
  all: ["admin", "users"] as const,
  list: (input: Required<AdminUsersQueryInput>) =>
    [
      "admin",
      "users",
      input.cursor,
      input.limit,
      input.q,
      input.role,
      input.isVerified,
      input.sortBy,
      input.sortDirection,
    ] as const,
  detail: (userId: string) => ["admin", "users", "detail", userId] as const,
};

function resolveQueryInput(input: AdminUsersQueryInput): Required<AdminUsersQueryInput> {
  return {
    cursor: input.cursor?.trim() || "",
    limit: input.limit ?? ADMIN_USERS_LIMIT,
    q: input.q?.trim() || "",
    role: input.role ?? "",
    isVerified: input.isVerified ?? "",
    sortBy: input.sortBy ?? DEFAULT_ADMIN_USER_SORT_BY,
    sortDirection: input.sortDirection ?? DEFAULT_ADMIN_USER_SORT_DIRECTION,
  };
}

export async function fetchAdminUsers(
  input: AdminUsersQueryInput & { signal?: AbortSignal } = {}
): Promise<AdminUsersListResponse> {
  const query = resolveQueryInput(input);
  const params = new URLSearchParams({
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);
  if (query.role) params.set("role", query.role);
  if (typeof query.isVerified === "boolean") {
    params.set("isVerified", String(query.isVerified));
  }

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/users?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load admin users right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin users");
  }

  return (await response.json()) as AdminUsersListResponse;
}

export function useAdminUsers(input: AdminUsersQueryInput) {
  const queryInput = resolveQueryInput(input);

  const query = useQuery({
    queryKey: adminUsersQueryKeys.list(queryInput),
    meta: {
      sentryName: "fetchAdminUsers",
      sentryEndpoint: "/api/v1/admin/users",
    },
    queryFn: ({ signal }) =>
      fetchAdminUsers({
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
    createEmptyAdminUsersResponse(queryInput.limit, queryInput.sortBy, queryInput.sortDirection);

  return {
    ...query,
    data,
    items: data.items,
    isInitialLoading: query.isPending && !query.data,
    isPageTransitioning: query.isFetching && query.isPlaceholderData,
  };
}
