"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchAuthorProfile, fetchShowcase, fetchShowcaseCategories } from "@/lib/api/showcase";
import type { ShowcaseFilters } from "@/types/showcase";

export function useShowcase(filters: ShowcaseFilters) {
  return useInfiniteQuery({
    queryKey: ["showcase", filters],
    queryFn: ({ pageParam }) => fetchShowcase(filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}

export function useShowcaseCategories() {
  return useQuery({
    queryKey: ["showcase-categories"],
    queryFn: fetchShowcaseCategories,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAuthorProfile(showcaseId: string | null) {
  return useQuery({
    queryKey: ["author-profile", showcaseId],
    queryFn: () => fetchAuthorProfile(showcaseId as string),
    enabled: !!showcaseId,
  });
}
