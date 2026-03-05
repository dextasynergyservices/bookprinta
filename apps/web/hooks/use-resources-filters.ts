"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export interface ResourcesFilterState {
  category: string;
}

const DEFAULT_FILTERS: ResourcesFilterState = {
  category: "",
};

function normalizeCategorySlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function useResourcesFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<ResourcesFilterState>(
    () => ({
      category: normalizeCategorySlug(searchParams.get("category") || DEFAULT_FILTERS.category),
    }),
    [searchParams]
  );

  const setCategory = useCallback(
    (categorySlug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const normalizedCategory = normalizeCategorySlug(categorySlug);

      if (normalizedCategory.length > 0) {
        params.set("category", normalizedCategory);
      } else {
        params.delete("category");
      }

      // Category changes should always reset cursor-based pagination.
      params.delete("cursor");

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const clearCategory = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("category");
    params.delete("cursor");

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  return {
    filters,
    category: filters.category,
    hasCategoryFilter: filters.category.length > 0,
    setCategory,
    clearCategory,
  };
}
