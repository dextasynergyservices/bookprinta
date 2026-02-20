"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import type { ShowcaseFilters, ShowcaseSortOption } from "@/types/showcase";

const DEFAULT_FILTERS: ShowcaseFilters = {
  q: "",
  category: "",
  sort: "date_desc",
  year: "",
};

export function useShowcaseFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: ShowcaseFilters = useMemo(
    () => ({
      q: searchParams.get("q") || DEFAULT_FILTERS.q,
      category: searchParams.get("category") || DEFAULT_FILTERS.category,
      sort: (searchParams.get("sort") as ShowcaseSortOption) || DEFAULT_FILTERS.sort,
      year: searchParams.get("year") || DEFAULT_FILTERS.year,
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (updates: Partial<ShowcaseFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== DEFAULT_FILTERS[key as keyof ShowcaseFilters]) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const hasActiveFilters = useMemo(
    () =>
      filters.q !== DEFAULT_FILTERS.q ||
      filters.category !== DEFAULT_FILTERS.category ||
      filters.sort !== DEFAULT_FILTERS.sort ||
      filters.year !== DEFAULT_FILTERS.year,
    [filters]
  );

  return { filters, setFilters, clearFilters, hasActiveFilters };
}
