import { RateLimitError, throwApiError } from "@/lib/api-error";
import type {
  ResourceDetail,
  ResourcesCategoriesResponse,
  ResourcesListFilters,
  ResourcesListResponse,
} from "@/types/resources";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function isNextProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function isBuildSafeFallbackEnabled(): boolean {
  return isNextProductionBuildPhase();
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function normalizeCategorySlug(category?: string): string | undefined {
  if (!category) return undefined;
  const normalized = category.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 9;
  return Math.max(1, Math.min(30, Math.floor(limit as number)));
}

function buildListQuery(params: { category?: string; cursor?: string; limit?: number }): string {
  const searchParams = new URLSearchParams();
  const category = normalizeCategorySlug(params.category);

  if (category) searchParams.set("category", category);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  searchParams.set("limit", String(normalizeLimit(params.limit)));

  return searchParams.toString();
}

export async function fetchResourceCategories(
  signal?: AbortSignal
): Promise<ResourcesCategoriesResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/resources/categories`, { signal });

  if (!response.ok) {
    await throwApiError(response, "Failed to fetch resource categories");
  }

  return response.json();
}

export async function fetchResourcesPage(
  filters: ResourcesListFilters,
  cursor?: string,
  signal?: AbortSignal
): Promise<ResourcesListResponse> {
  const query = buildListQuery({
    category: filters.category,
    cursor,
    limit: filters.limit,
  });

  const response = await fetch(`${API_V1_BASE_URL}/resources?${query}`, { signal });

  if (!response.ok) {
    await throwApiError(response, "Failed to fetch resources");
  }

  return response.json();
}

export async function fetchResourceDetail(
  slug: string,
  signal?: AbortSignal
): Promise<ResourceDetail> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw new Error("Resource slug is required");
  }

  const response = await fetch(
    `${API_V1_BASE_URL}/resources/${encodeURIComponent(normalizedSlug)}`,
    {
      signal,
    }
  );

  if (!response.ok) {
    await throwApiError(response, "Failed to fetch resource detail");
  }

  return response.json();
}

export async function fetchResourceDetailForServer(slug: string): Promise<ResourceDetail | null> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw new Error("Resource slug is required");
  }

  const response = await fetch(
    `${API_V1_BASE_URL}/resources/${encodeURIComponent(normalizedSlug)}`,
    {
      next: { revalidate: 300 },
    }
  );

  if (response.status === 404) {
    return null;
  }

  // During static generation, avoid failing the entire build on transient API throttling.
  if (response.status === 429 && isBuildSafeFallbackEnabled()) {
    return null;
  }

  // During production build, degrade gracefully for transient upstream issues.
  // Returning null here allows the page to fall back to metadata defaults/notFound without aborting `next build`.
  if (!response.ok && isBuildSafeFallbackEnabled()) {
    return null;
  }

  if (!response.ok) {
    await throwApiError(response, "Failed to fetch resource detail");
  }

  return response.json();
}

export async function fetchPublishedResourceSlugsForStaticParams(): Promise<string[]> {
  const slugs: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pageSafetyCounter = 0;

  while (pageSafetyCounter < 200) {
    pageSafetyCounter += 1;
    let page: ResourcesListResponse;

    try {
      page = await fetchResourcesPage({ limit: 30 }, cursor);
    } catch (error) {
      // During production build, a rate-limited page fetch should not fail deployment.
      if (error instanceof RateLimitError && isBuildSafeFallbackEnabled()) {
        break;
      }

      // During production build, stop expanding static params on transient upstream failures.
      if (isBuildSafeFallbackEnabled()) {
        break;
      }

      throw error;
    }

    for (const item of page.items) {
      const normalizedSlug = normalizeSlug(item.slug);
      if (!normalizedSlug || seen.has(normalizedSlug)) continue;
      seen.add(normalizedSlug);
      slugs.push(normalizedSlug);
    }

    if (!page.hasMore || !page.nextCursor || seen.has(page.nextCursor)) {
      break;
    }

    cursor = page.nextCursor;
  }

  return slugs;
}
