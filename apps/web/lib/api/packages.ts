import * as Sentry from "@sentry/nextjs";

type HttpError = Error & { status?: number };

export type PackageCopies = {
  A4: number;
  A5: number;
  A6: number;
};

export type PackageFeatures = {
  items: string[];
  copies: PackageCopies;
};

export type PackageBase = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  pageLimit: number;
  includesISBN: boolean;
  features: PackageFeatures;
  isActive: boolean;
  sortOrder: number;
};

export type PackageCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  copies: number;
  isActive: boolean;
  sortOrder: number;
  packages: PackageBase[];
};

export const PACKAGE_CATEGORIES_QUERY_KEY = ["package-categories"] as const;
export const PACKAGES_QUERY_KEY = ["packages"] as const;

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

function capturePackageError(endpoint: string, error: unknown): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("layer", "web");
    scope.setTag("source", "packages-api");
    scope.setTag("endpoint", endpoint);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export async function fetchPackageCategories(options?: {
  revalidate?: number;
}): Promise<PackageCategory[]> {
  try {
    const requestInit: RequestInit & {
      next?: {
        revalidate: number;
      };
    } = {};

    if (typeof options?.revalidate === "number") {
      requestInit.next = { revalidate: options.revalidate };
    }

    const res = await fetch(`${API_V1_BASE_URL}/package-categories`, requestInit);
    if (!res.ok) {
      throw createHttpError("Failed to fetch package categories", res.status);
    }
    return res.json();
  } catch (error) {
    capturePackageError("/package-categories", error);
    throw error;
  }
}

export async function fetchPackages(): Promise<
  (PackageBase & { category: Omit<PackageCategory, "packages"> })[]
> {
  try {
    const res = await fetch(`${API_V1_BASE_URL}/packages`);
    if (!res.ok) {
      throw createHttpError("Failed to fetch packages", res.status);
    }
    return res.json();
  } catch (error) {
    capturePackageError("/packages", error);
    throw error;
  }
}
