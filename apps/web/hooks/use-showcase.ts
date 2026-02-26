"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchAuthorProfile, fetchShowcase, fetchShowcaseCategories } from "@/lib/api/showcase";
import type { ShowcaseFilters } from "@/types/showcase";

export function useShowcase(filters: ShowcaseFilters) {
  return useInfiniteQuery({
    queryKey: ["showcase", filters],
    meta: {
      sentryName: "fetchShowcase",
      sentryEndpoint: "/api/v1/showcase",
    },
    queryFn: ({ pageParam }) => fetchShowcase(filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}

export function useShowcaseCategories() {
  return useQuery({
    queryKey: ["showcase-categories"],
    meta: {
      sentryName: "fetchShowcaseCategories",
      sentryEndpoint: "/api/v1/showcase/categories",
    },
    queryFn: fetchShowcaseCategories,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAuthorProfile(showcaseId: string | null) {
  return useQuery({
    queryKey: ["author-profile", showcaseId],
    meta: {
      sentryName: "fetchAuthorProfile",
      sentryEndpoint: showcaseId ? `/api/v1/showcase/${showcaseId}/author` : undefined,
    },
    queryFn: () => fetchAuthorProfile(showcaseId as string),
    enabled: !!showcaseId,
  });
}
