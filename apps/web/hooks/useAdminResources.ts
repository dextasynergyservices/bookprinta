"use client";

import type {
  AdminCreateResourceCategoryInput,
  AdminCreateResourceInput,
  AdminResourceCategoriesListQuery,
  AdminResourceCategoriesListResponse,
  AdminResourcesListQuery,
  AdminUpdateResourceCategoryInput,
  AdminUpdateResourceInput,
} from "@bookprinta/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminResource,
  createAdminResourceCategory,
  deleteAdminResource,
  deleteAdminResourceCategory,
  fetchAdminResourceCategories,
  fetchAdminResourceDetail,
  fetchAdminResourceSlugAvailability,
  fetchAdminResources,
  updateAdminResource,
  updateAdminResourceCategory,
  uploadAdminResourceCover,
} from "@/lib/api/admin-resources";

export const adminResourcesQueryKeys = {
  all: ["admin", "resources"] as const,
  categories: ["admin", "resources", "categories"] as const,
  categoryList: (query: ResolvedAdminCategoryQuery) =>
    ["admin", "resources", "categories", query.isActive] as const,
  resources: ["admin", "resources", "list"] as const,
  resourceList: (query: ResolvedAdminResourcesQuery) =>
    [
      "admin",
      "resources",
      "list",
      query.cursor,
      query.limit,
      query.q,
      query.categoryId,
      query.isPublished,
    ] as const,
  resourceDetail: (resourceId: string) => ["admin", "resources", "detail", resourceId] as const,
  slugAvailability: (slug: string, excludeId: string) =>
    ["admin", "resources", "slug-availability", slug, excludeId] as const,
};

type ResolvedAdminResourcesQuery = {
  cursor: string;
  limit: number;
  q: string;
  categoryId: string;
  isPublished: "all" | "true" | "false";
};

type ResolvedAdminCategoryQuery = {
  isActive: "all" | "true" | "false";
};

function resolveAdminResourcesQuery(query: AdminResourcesListQuery): ResolvedAdminResourcesQuery {
  return {
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 20,
    q: query.q?.trim() || "",
    categoryId: query.categoryId?.trim() || "",
    isPublished:
      typeof query.isPublished === "boolean" ? (query.isPublished ? "true" : "false") : "all",
  };
}

function resolveAdminCategoryQuery(
  query: AdminResourceCategoriesListQuery = {}
): ResolvedAdminCategoryQuery {
  return {
    isActive: typeof query.isActive === "boolean" ? (query.isActive ? "true" : "false") : "all",
  };
}

async function invalidateAdminAndPublicResourceQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminResourcesQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["resource-categories"] }),
    queryClient.invalidateQueries({ queryKey: ["resources"] }),
    queryClient.invalidateQueries({ queryKey: ["resource-detail"] }),
  ]);
}

function applyCategoryUpdaterToCachedLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (
    category: AdminResourceCategoriesListResponse["categories"][number]
  ) => AdminResourceCategoriesListResponse["categories"][number]
) {
  queryClient.setQueriesData<AdminResourceCategoriesListResponse>(
    { queryKey: adminResourcesQueryKeys.categories },
    (previous) => {
      if (!previous) {
        return previous;
      }

      const categories = previous.categories
        .map((category) => updater(category))
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return left.name.localeCompare(right.name);
        });

      return {
        ...previous,
        categories,
      };
    }
  );
}

export function useAdminResourceCategories(query: AdminResourceCategoriesListQuery = {}) {
  const normalizedQuery = resolveAdminCategoryQuery(query);
  const requestQuery: AdminResourceCategoriesListQuery = {
    isActive: normalizedQuery.isActive === "all" ? undefined : normalizedQuery.isActive === "true",
  };

  const categoriesQuery = useQuery({
    queryKey: adminResourcesQueryKeys.categoryList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminResourceCategories",
      sentryEndpoint: "/api/v1/admin/resource-categories",
    },
    queryFn: ({ signal }) => fetchAdminResourceCategories(requestQuery, { signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = categoriesQuery.data ?? { categories: [] };

  return {
    ...categoriesQuery,
    data,
    categories: data.categories,
    isInitialLoading: categoriesQuery.isPending && !categoriesQuery.data,
  };
}

export function useAdminResources(query: AdminResourcesListQuery) {
  const normalizedQuery = resolveAdminResourcesQuery(query);

  const resourcesQuery = useQuery({
    queryKey: adminResourcesQueryKeys.resourceList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminResources",
      sentryEndpoint: "/api/v1/admin/resources",
    },
    queryFn: ({ signal }) => fetchAdminResources(query, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = resourcesQuery.data ?? { items: [], nextCursor: null, hasMore: false };

  return {
    ...resourcesQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    isInitialLoading: resourcesQuery.isPending && !resourcesQuery.data,
    isPageTransitioning: resourcesQuery.isFetching && resourcesQuery.isPlaceholderData,
  };
}

export function useAdminResourceSlugAvailability(
  input: {
    slug: string;
    excludeId?: string;
  },
  enabled = true
) {
  const normalizedSlug = input.slug.trim().toLowerCase();
  const normalizedExcludeId = input.excludeId?.trim() || "";

  const slugQuery = useQuery({
    queryKey: adminResourcesQueryKeys.slugAvailability(normalizedSlug, normalizedExcludeId),
    enabled: enabled && normalizedSlug.length > 0,
    meta: {
      sentryName: "fetchAdminResourceSlugAvailability",
      sentryEndpoint: "/api/v1/admin/resources/slug-availability",
    },
    queryFn: ({ signal }) =>
      fetchAdminResourceSlugAvailability({
        slug: normalizedSlug,
        ...(normalizedExcludeId.length > 0 ? { excludeId: normalizedExcludeId } : {}),
        signal,
      }),
    staleTime: 10_000,
    gcTime: 1000 * 60 * 3,
    retry: 1,
  });

  return {
    ...slugQuery,
    isChecking: slugQuery.isFetching,
    isAvailable: slugQuery.data?.isAvailable ?? null,
  };
}

export function useAdminResourceDetail(resourceId: string, enabled = true) {
  const normalizedId = resourceId.trim();

  const detailQuery = useQuery({
    queryKey: adminResourcesQueryKeys.resourceDetail(normalizedId),
    enabled: enabled && normalizedId.length > 0,
    meta: {
      sentryName: "fetchAdminResourceDetail",
      sentryEndpoint: "/api/v1/admin/resources/:id",
    },
    queryFn: ({ signal }) => fetchAdminResourceDetail(normalizedId, { signal }),
    staleTime: 15_000,
    gcTime: 1000 * 60 * 5,
    retry: 1,
  });

  return {
    ...detailQuery,
    isInitialLoading: detailQuery.isPending && !detailQuery.data,
  };
}

export function useCreateAdminResourceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateResourceCategoryInput) => createAdminResourceCategory(input),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useUpdateAdminResourceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { categoryId: string; input: AdminUpdateResourceCategoryInput }) =>
      updateAdminResourceCategory(params),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useDeleteAdminResourceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => deleteAdminResourceCategory(categoryId),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useReorderAdminResourceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { categoryId: string; sortOrder: number }) =>
      updateAdminResourceCategory({
        categoryId: params.categoryId,
        input: { sortOrder: params.sortOrder },
      }),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: adminResourcesQueryKeys.categories });

      const previousCategoryQueries =
        queryClient.getQueriesData<AdminResourceCategoriesListResponse>({
          queryKey: adminResourcesQueryKeys.categories,
        });

      applyCategoryUpdaterToCachedLists(queryClient, (category) =>
        category.id === params.categoryId ? { ...category, sortOrder: params.sortOrder } : category
      );

      return { previousCategoryQueries };
    },
    onError: (_error, _params, context) => {
      if (!context?.previousCategoryQueries) {
        return;
      }

      for (const [queryKey, previousData] of context.previousCategoryQueries) {
        queryClient.setQueryData(queryKey, previousData);
      }
    },
    onSettled: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useToggleAdminResourceCategoryActiveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { categoryId: string; isActive: boolean }) =>
      updateAdminResourceCategory({
        categoryId: params.categoryId,
        input: { isActive: params.isActive },
      }),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: adminResourcesQueryKeys.categories });

      const previousCategoryQueries =
        queryClient.getQueriesData<AdminResourceCategoriesListResponse>({
          queryKey: adminResourcesQueryKeys.categories,
        });

      applyCategoryUpdaterToCachedLists(queryClient, (category) =>
        category.id === params.categoryId ? { ...category, isActive: params.isActive } : category
      );

      return { previousCategoryQueries };
    },
    onError: (_error, _params, context) => {
      if (!context?.previousCategoryQueries) {
        return;
      }

      for (const [queryKey, previousData] of context.previousCategoryQueries) {
        queryClient.setQueryData(queryKey, previousData);
      }
    },
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useCreateAdminResourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateResourceInput) => createAdminResource(input),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useUpdateAdminResourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { resourceId: string; input: AdminUpdateResourceInput }) =>
      updateAdminResource(params),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useDeleteAdminResourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) => deleteAdminResource(resourceId),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useToggleAdminResourcePublishedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { resourceId: string; isPublished: boolean }) =>
      updateAdminResource({
        resourceId: params.resourceId,
        input: {
          isPublished: params.isPublished,
        },
      }),
    onSuccess: async () => {
      await invalidateAdminAndPublicResourceQueries(queryClient);
    },
  });
}

export function useAdminResourceCoverUploadMutation() {
  return useMutation({
    mutationFn: (params: {
      file: File;
      signal?: AbortSignal;
      onProgress?: (percentage: number) => void;
    }) => uploadAdminResourceCover(params),
  });
}
