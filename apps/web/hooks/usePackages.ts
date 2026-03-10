import { useQuery } from "@tanstack/react-query";
import {
  fetchPackageCategories,
  fetchPackages,
  PACKAGE_CATEGORIES_QUERY_KEY,
  PACKAGES_QUERY_KEY,
  type PackageBase,
  type PackageCategory,
} from "@/lib/api/packages";

export type {
  PackageBase,
  PackageCategory,
  PackageCopies,
  PackageFeatures,
} from "@/lib/api/packages";

/**
 * Fetch package categories with nested packages from the API.
 * Used on the pricing page for category-grouped display.
 *
 * Endpoint: GET /api/v1/package-categories
 */
export function usePackageCategories() {
  return useQuery<PackageCategory[]>({
    queryKey: PACKAGE_CATEGORIES_QUERY_KEY,
    meta: {
      sentryName: "fetchPackageCategories",
      sentryEndpoint: "/api/v1/package-categories",
    },
    queryFn: () => fetchPackageCategories(),
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
    queryKey: PACKAGES_QUERY_KEY,
    meta: {
      sentryName: "fetchPackages",
      sentryEndpoint: "/api/v1/packages",
    },
    queryFn: () => fetchPackages(),
    staleTime: 1000 * 60 * 10,
  });
}
