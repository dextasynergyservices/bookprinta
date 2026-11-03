"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { bookProgressQueryKeys } from "./useBookProgress";
import { dashboardOverviewQueryKey } from "./useDashboardOverview";
import { ordersQueryKeys } from "./useOrders";
import { orderTrackingQueryKeys } from "./useOrderTracking";
import { userBooksQueryKeys } from "./useUserBooks";

/**
 * Everything a manuscript upload changes for the author: the book's title,
 * status, word count and estimates, its file list, and the order and book
 * journeys. Each of these is cached for a minute, so without this the books
 * list, overview, orders and tracking pages show the pre-upload state when
 * the author goes back to them.
 */
export const MANUSCRIPT_UPLOAD_AFFECTED_QUERY_KEYS = [
  bookProgressQueryKeys.all,
  ["book-resource"],
  userBooksQueryKeys.all,
  dashboardOverviewQueryKey,
  ordersQueryKeys.all,
  orderTrackingQueryKeys.all,
] as const;

export function useRefreshAfterManuscriptUpload(): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all(
      MANUSCRIPT_UPLOAD_AFFECTED_QUERY_KEYS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey })
      )
    );
  }, [queryClient]);
}
