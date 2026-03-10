import * as Sentry from "@sentry/nextjs";
import type {
  AuthorProfile,
  ShowcaseCategoriesResponse,
  ShowcaseEntry,
  ShowcaseFilters,
  ShowcaseResponse,
} from "@/types/showcase";

type HttpError = Error & { status?: number };

type ShowcaseRequestOptions = {
  limit?: number;
  isFeatured?: boolean;
  revalidate?: number;
};

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function captureShowcaseError(endpoint: string, error: unknown): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("layer", "web");
    scope.setTag("source", "showcase-api");
    scope.setTag("endpoint", endpoint);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

async function fetchJson<T>(
  endpoint: string,
  options?: {
    revalidate?: number;
  }
): Promise<T> {
  try {
    const init: RequestInit & {
      next?: {
        revalidate: number;
      };
    } = {};

    if (typeof options?.revalidate === "number") {
      init.next = { revalidate: options.revalidate };
    }

    const res = await fetch(`${API_V1_BASE_URL}${endpoint}`, init);
    if (!res.ok) {
      throw createHttpError(`Showcase API request failed: ${endpoint}`, res.status);
    }

    return res.json();
  } catch (error) {
    captureShowcaseError(endpoint, error);
    throw error;
  }
}

export async function fetchShowcase(
  filters: ShowcaseFilters,
  cursor?: string,
  options?: ShowcaseRequestOptions
): Promise<ShowcaseResponse> {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.year) params.set("year", filters.year);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(options?.limit ?? 6));
  if (options?.isFeatured === true) {
    params.set("isFeatured", "true");
  }

  return fetchJson<ShowcaseResponse>(`/showcase?${params.toString()}`, {
    revalidate: options?.revalidate,
  });
}

export async function fetchFeaturedShowcasePreview(options?: {
  limit?: number;
  revalidate?: number;
}): Promise<ShowcaseEntry[]> {
  const response = await fetchShowcase(
    {
      q: "",
      category: "",
      sort: "date_desc",
      year: "",
    },
    undefined,
    {
      isFeatured: true,
      limit: options?.limit ?? 4,
      revalidate: options?.revalidate,
    }
  );

  return response.items;
}

export async function fetchShowcaseCategories(options?: {
  revalidate?: number;
}): Promise<ShowcaseCategoriesResponse> {
  return fetchJson<ShowcaseCategoriesResponse>("/showcase/categories", {
    revalidate: options?.revalidate,
  });
}

export async function fetchAuthorProfile(showcaseId: string): Promise<AuthorProfile> {
  return fetchJson<AuthorProfile>(`/showcase/${showcaseId}/author`);
}
