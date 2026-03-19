import type {
  AdminDeleteReviewResponse,
  AdminReviewsListQuery,
  AdminReviewsListResponse,
  AdminUpdateReviewInput,
  AdminUpdateReviewResponse,
} from "@bookprinta/shared";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function buildParamsFromAdminReviewsListQuery(query: AdminReviewsListQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit),
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);
  if (typeof query.isPublic === "boolean") params.set("isPublic", String(query.isPublic));
  if (typeof query.rating === "number") params.set("rating", String(query.rating));

  return params;
}

export async function fetchAdminReviews(
  query: AdminReviewsListQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminReviewsListResponse> {
  const params = buildParamsFromAdminReviewsListQuery(query);
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/reviews?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load reviews right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load reviews");
  }

  return (await response.json()) as AdminReviewsListResponse;
}

export async function updateAdminReview(params: {
  reviewId: string;
  input: AdminUpdateReviewInput;
}): Promise<AdminUpdateReviewResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/reviews/${encodeURIComponent(params.reviewId)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.input),
      }
    );
  } catch {
    throw new Error("Unable to update review right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update review");
  }

  return (await response.json()) as AdminUpdateReviewResponse;
}

export async function deleteAdminReview(reviewId: string): Promise<AdminDeleteReviewResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/reviews/${encodeURIComponent(reviewId)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete review right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete review");
  }

  return (await response.json()) as AdminDeleteReviewResponse;
}
