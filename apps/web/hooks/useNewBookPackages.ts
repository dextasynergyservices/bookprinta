import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboardNewBookPricing,
  NEW_BOOK_PRICING_QUERY_KEY,
  type NewBookPricingResponse,
} from "@/lib/api/dashboard-new-book";

/**
 * Fetch package categories for the "Print a New Book" dashboard page.
 *
 * Endpoint: GET /api/v1/dashboard/new-book (authenticated)
 */
export function useNewBookPackages() {
  return useQuery<NewBookPricingResponse>({
    queryKey: NEW_BOOK_PRICING_QUERY_KEY,
    meta: {
      sentryName: "fetchDashboardNewBookPricing",
      sentryEndpoint: "/api/v1/dashboard/new-book",
    },
    queryFn: () => fetchDashboardNewBookPricing(),
    staleTime: 1000 * 60 * 5,
  });
}
