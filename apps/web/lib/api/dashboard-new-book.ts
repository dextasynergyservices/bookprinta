import * as Sentry from "@sentry/nextjs";
import type { PackageCategory } from "./packages";

type HttpError = Error & { status?: number };

export type NewBookPricingResponse = {
  categories: PackageCategory[];
};

export const NEW_BOOK_PRICING_QUERY_KEY = ["dashboard", "new-book-pricing"] as const;

function getApiV1BaseUrl() {
  if (typeof window !== "undefined") return "/api/v1";

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

function captureError(endpoint: string, error: unknown): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("layer", "web");
    scope.setTag("source", "dashboard-new-book-api");
    scope.setTag("endpoint", endpoint);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

/**
 * Fetch package categories for the "Print a New Book" dashboard page.
 * Requires authentication (cookie-based JWT).
 */
export async function fetchDashboardNewBookPricing(): Promise<NewBookPricingResponse> {
  try {
    const res = await fetch(`${API_V1_BASE_URL}/dashboard/new-book`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw createHttpError("Failed to fetch new book pricing", res.status);
    }
    return res.json();
  } catch (error) {
    captureError("/dashboard/new-book", error);
    throw error;
  }
}
