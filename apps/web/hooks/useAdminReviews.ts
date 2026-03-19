"use client";

import type { AdminReviewsListQuery, AdminUpdateReviewInput } from "@bookprinta/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAdminReview, fetchAdminReviews, updateAdminReview } from "@/lib/api/admin-reviews";

export const adminReviewsQueryKeys = {
  all: ["admin", "reviews"] as const,
  list: ["admin", "reviews", "list"] as const,
  reviewList: (query: ResolvedAdminReviewsQuery) =>
    [
      "admin",
      "reviews",
      "list",
      query.cursor,
      query.limit,
      query.q,
      query.isPublic,
      query.rating,
    ] as const,
};

type ResolvedAdminReviewsQuery = {
  cursor: string;
  limit: number;
  q: string;
  isPublic: "all" | "true" | "false";
  rating: "all" | "1" | "2" | "3" | "4" | "5";
};

function resolveAdminReviewsQuery(query: AdminReviewsListQuery): ResolvedAdminReviewsQuery {
  const rating = query.rating;

  return {
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 20,
    q: query.q?.trim() || "",
    isPublic: typeof query.isPublic === "boolean" ? (query.isPublic ? "true" : "false") : "all",
    rating:
      typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5
        ? (String(rating) as ResolvedAdminReviewsQuery["rating"])
        : "all",
  };
}

function toApiQuery(normalizedQuery: ResolvedAdminReviewsQuery): AdminReviewsListQuery {
  return {
    ...(normalizedQuery.cursor ? { cursor: normalizedQuery.cursor } : {}),
    limit: normalizedQuery.limit,
    ...(normalizedQuery.q ? { q: normalizedQuery.q } : {}),
    ...(normalizedQuery.isPublic === "all"
      ? {}
      : { isPublic: normalizedQuery.isPublic === "true" }),
    ...(normalizedQuery.rating === "all" ? {} : { rating: Number(normalizedQuery.rating) }),
  };
}

async function invalidateAdminReviewQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: adminReviewsQueryKeys.all });
}

export function useAdminReviews(query: AdminReviewsListQuery) {
  const normalizedQuery = resolveAdminReviewsQuery(query);
  const requestQuery = toApiQuery(normalizedQuery);

  const reviewsQuery = useQuery({
    queryKey: adminReviewsQueryKeys.reviewList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminReviews",
      sentryEndpoint: "/api/v1/admin/reviews",
    },
    queryFn: ({ signal }) => fetchAdminReviews(requestQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = reviewsQuery.data ?? { items: [], nextCursor: null, hasMore: false };

  return {
    ...reviewsQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    isInitialLoading: reviewsQuery.isPending && !reviewsQuery.data,
    isPageTransitioning: reviewsQuery.isFetching && reviewsQuery.isPlaceholderData,
  };
}

export function useModerateAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { reviewId: string; input: AdminUpdateReviewInput }) =>
      updateAdminReview(params),
    onSuccess: async () => {
      await invalidateAdminReviewQueries(queryClient);
    },
  });
}

export function useToggleAdminReviewVisibilityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { reviewId: string; isPublic: boolean }) =>
      updateAdminReview({
        reviewId: params.reviewId,
        input: {
          isPublic: params.isPublic,
          comment: undefined,
        },
      }),
    onSuccess: async () => {
      await invalidateAdminReviewQueries(queryClient);
    },
  });
}

export function useDeleteAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reviewId: string) => deleteAdminReview(reviewId),
    onSuccess: async () => {
      await invalidateAdminReviewQueries(queryClient);
    },
  });
}
