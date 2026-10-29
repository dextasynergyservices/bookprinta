"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_EXTRA_PAGE_PRICE_NGN, fetchExtraPagePrice } from "@/lib/api/pricing-settings";

/**
 * The admin-configured price per extra page (NGN), for displaying the billing
 * gate. The API computes every charge itself; this only turns a naira amount
 * into a page count for the UI. Falls back to the default while loading.
 */
export function useExtraPagePrice(): number {
  const query = useQuery({
    queryKey: ["pricing-settings", "extra-page-price"],
    queryFn: ({ signal }) => fetchExtraPagePrice({ signal }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return query.data ?? DEFAULT_EXTRA_PAGE_PRICE_NGN;
}
