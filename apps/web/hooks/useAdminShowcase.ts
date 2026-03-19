"use client";

import type {
  AdminCreateShowcaseCategoryInput,
  AdminCreateShowcaseEntryInput,
  AdminShowcaseEntriesListQuery,
  AdminShowcaseUserSearchQuery,
  AdminUpdateShowcaseCategoryInput,
  AdminUpdateShowcaseEntryInput,
} from "@bookprinta/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminShowcaseCategory,
  createAdminShowcaseEntry,
  deleteAdminShowcaseCategory,
  deleteAdminShowcaseEntry,
  fetchAdminShowcaseCategories,
  fetchAdminShowcaseEntries,
  searchAdminShowcaseUsers,
  updateAdminShowcaseCategory,
  updateAdminShowcaseEntry,
  uploadAdminShowcaseCover,
} from "@/lib/api/admin-showcase";

export const adminShowcaseQueryKeys = {
  all: ["admin", "showcase"] as const,
  categories: ["admin", "showcase", "categories"] as const,
  entries: ["admin", "showcase", "entries"] as const,
  entryList: (query: ResolvedAdminShowcaseEntriesQuery) =>
    [
      "admin",
      "showcase",
      "entries",
      query.cursor,
      query.limit,
      query.q,
      query.categoryId,
      query.isFeatured,
      query.sort,
    ] as const,
  userSearch: (query: Required<AdminShowcaseUserSearchQuery>) =>
    ["admin", "showcase", "users", "search", query.q, query.cursor, query.limit] as const,
};

type ResolvedAdminShowcaseEntriesQuery = {
  cursor: string;
  limit: number;
  q: string;
  categoryId: string;
  isFeatured?: boolean;
  sort: AdminShowcaseEntriesListQuery["sort"];
};

function resolveEntriesQuery(
  query: AdminShowcaseEntriesListQuery
): ResolvedAdminShowcaseEntriesQuery {
  return {
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 20,
    q: query.q?.trim() || "",
    categoryId: query.categoryId?.trim() || "",
    isFeatured: query.isFeatured,
    sort: query.sort ?? "sort_order_asc",
  };
}

function resolveUserSearchQuery(
  query: AdminShowcaseUserSearchQuery
): Required<AdminShowcaseUserSearchQuery> {
  return {
    q: query.q?.trim() || "",
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 10,
  };
}

async function invalidateAdminShowcaseQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminShowcaseQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: adminShowcaseQueryKeys.categories }),
    queryClient.invalidateQueries({ queryKey: adminShowcaseQueryKeys.entries }),
    // Public showcase caches impacted by admin mutations.
    queryClient.invalidateQueries({ queryKey: ["showcase"] }),
    queryClient.invalidateQueries({ queryKey: ["showcase-categories"] }),
  ]);
}

export function useAdminShowcaseCategories() {
  const query = useQuery({
    queryKey: adminShowcaseQueryKeys.categories,
    meta: {
      sentryName: "fetchAdminShowcaseCategories",
      sentryEndpoint: "/api/v1/admin/showcase-categories",
    },
    queryFn: ({ signal }) => fetchAdminShowcaseCategories({ signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = query.data ?? { categories: [] };

  return {
    ...query,
    data,
    categories: data.categories,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useAdminShowcaseEntries(query: AdminShowcaseEntriesListQuery) {
  const normalizedQuery = resolveEntriesQuery(query);

  const entriesQuery = useQuery({
    queryKey: adminShowcaseQueryKeys.entryList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminShowcaseEntries",
      sentryEndpoint: "/api/v1/admin/showcase",
    },
    queryFn: ({ signal }) => fetchAdminShowcaseEntries(normalizedQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = entriesQuery.data ?? { items: [], nextCursor: null, hasMore: false };

  return {
    ...entriesQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    isInitialLoading: entriesQuery.isPending && !entriesQuery.data,
    isPageTransitioning: entriesQuery.isFetching && entriesQuery.isPlaceholderData,
  };
}

export function useAdminShowcaseUserSearch(query: AdminShowcaseUserSearchQuery, enabled = true) {
  const normalizedQuery = resolveUserSearchQuery(query);

  const userSearchQuery = useQuery({
    queryKey: adminShowcaseQueryKeys.userSearch(normalizedQuery),
    enabled,
    meta: {
      sentryName: "searchAdminShowcaseUsers",
      sentryEndpoint: "/api/v1/admin/showcase/users/search",
    },
    queryFn: ({ signal }) => searchAdminShowcaseUsers(normalizedQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 5,
    retry: 1,
  });

  const data = userSearchQuery.data ?? { items: [], nextCursor: null, hasMore: false };

  return {
    ...userSearchQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    isInitialLoading: userSearchQuery.isPending && !userSearchQuery.data,
    isPageTransitioning: userSearchQuery.isFetching && userSearchQuery.isPlaceholderData,
  };
}

export function useCreateAdminShowcaseCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateShowcaseCategoryInput) => createAdminShowcaseCategory(input),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useUpdateAdminShowcaseCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { categoryId: string; input: AdminUpdateShowcaseCategoryInput }) =>
      updateAdminShowcaseCategory(params),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useDeleteAdminShowcaseCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => deleteAdminShowcaseCategory(categoryId),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useCreateAdminShowcaseEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateShowcaseEntryInput) => createAdminShowcaseEntry(input),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useUpdateAdminShowcaseEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { entryId: string; input: AdminUpdateShowcaseEntryInput }) =>
      updateAdminShowcaseEntry(params),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useDeleteAdminShowcaseEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => deleteAdminShowcaseEntry(entryId),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useReorderAdminShowcaseEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { entryId: string; sortOrder: number }) =>
      updateAdminShowcaseEntry({
        entryId: params.entryId,
        input: { sortOrder: params.sortOrder },
      }),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useToggleAdminShowcaseEntryFeaturedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { entryId: string; isFeatured: boolean }) =>
      updateAdminShowcaseEntry({
        entryId: params.entryId,
        input: { isFeatured: params.isFeatured },
      }),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}

export function useAdminShowcaseCoverUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      file: File;
      entryId?: string;
      signal?: AbortSignal;
      onProgress?: (percentage: number) => void;
    }) => uploadAdminShowcaseCover(params),
    onSuccess: async () => {
      await invalidateAdminShowcaseQueries(queryClient);
    },
  });
}
