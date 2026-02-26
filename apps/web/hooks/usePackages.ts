import { useQuery } from "@tanstack/react-query";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

// ─── Types matching the new API shape (PackageCategoryResponse) ───

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

type HttpError = Error & { status?: number };

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

/**
 * Fetch package categories with nested packages from the API.
 * Used on the pricing page for category-grouped display.
 *
 * Endpoint: GET /api/v1/package-categories
 */
export function usePackageCategories() {
  return useQuery<PackageCategory[]>({
    queryKey: ["package-categories"],
    meta: {
      sentryName: "fetchPackageCategories",
      sentryEndpoint: "/api/v1/package-categories",
    },
    queryFn: async () => {
      const res = await fetch(`${API_V1_BASE_URL}/package-categories`);
      if (!res.ok) {
        throw createHttpError("Failed to fetch package categories", res.status);
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * Fetch flat list of all active packages.
 * Used for checkout, package detail, and places that don't need grouping.
 *
 * Endpoint: GET /api/v1/packages
 */
export function usePackages() {
  return useQuery<(PackageBase & { category: Omit<PackageCategory, "packages"> })[]>({
    queryKey: ["packages"],
    meta: {
      sentryName: "fetchPackages",
      sentryEndpoint: "/api/v1/packages",
    },
    queryFn: async () => {
      const res = await fetch(`${API_V1_BASE_URL}/packages`);
      if (!res.ok) {
        throw createHttpError("Failed to fetch packages", res.status);
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
}
