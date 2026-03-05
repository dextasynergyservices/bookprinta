"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchResourceCategories,
  fetchResourceDetail,
  fetchResourcesPage,
} from "@/lib/api/resources";
import type {
  ResourceDetail,
  ResourcesCategoriesResponse,
  ResourcesListFilters,
} from "@/types/resources";

const DEFAULT_PAGE_LIMIT = 9;

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
  return Math.max(1, Math.min(30, Math.floor(limit as number)));
}

function normalizeCategory(category?: string): string | undefined {
  if (!category) return undefined;
  const normalized = category.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function useResourceCategories() {
  const query = useQuery<ResourcesCategoriesResponse>({
    queryKey: ["resource-categories"],
    meta: {
      sentryName: "fetchResourceCategories",
      sentryEndpoint: "/api/v1/resources/categories",
    },
    queryFn: ({ signal }) => fetchResourceCategories(signal),
    staleTime: 5 * 60 * 1000,
  });

  const categories = query.data?.categories ?? [];
  const isEmpty = !query.isLoading && !query.isError && categories.length === 0;

  return {
    ...query,
    categories,
    isEmpty,
  };
}

export function useResources(filters: ResourcesListFilters = {}) {
  const normalizedCategory = normalizeCategory(filters.category);
  const limit = normalizeLimit(filters.limit);

  const query = useInfiniteQuery({
    queryKey: ["resources", { category: normalizedCategory ?? null, limit }],
    meta: {
      sentryName: "fetchResources",
      sentryEndpoint: "/api/v1/resources",
    },
    queryFn: ({ pageParam, signal }) =>
      fetchResourcesPage(
        {
          category: normalizedCategory,
          limit,
        },
        pageParam,
        signal
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const isInitialLoading = query.isLoading;
  const isEmpty = !isInitialLoading && !query.isError && items.length === 0;
  const isInitialError = query.isError && items.length === 0;

  return {
    ...query,
    items,
    isInitialLoading,
    isInitialError,
    isEmpty,
  };
}

export function useResourceDetail(slug: string | null) {
  const normalizedSlug = slug?.trim().toLowerCase() ?? "";

  const query = useQuery<ResourceDetail>({
    queryKey: ["resource-detail", normalizedSlug],
    meta: {
      sentryName: "fetchResourceDetail",
      sentryEndpoint: normalizedSlug ? `/api/v1/resources/${normalizedSlug}` : undefined,
    },
    queryFn: ({ signal }) => fetchResourceDetail(normalizedSlug, signal),
    enabled: normalizedSlug.length > 0,
  });

  const isEmpty = !query.isLoading && !query.isError && !query.data;

  return {
    ...query,
    isEmpty,
  };
}
