"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPublicMarketingSettings } from "@/lib/api/marketing-settings";

export const publicMarketingSettingsQueryKey = ["public", "marketing-settings"] as const;

export function usePublicMarketingSettings() {
  const query = useQuery({
    queryKey: publicMarketingSettingsQueryKey,
    meta: {
      sentryName: "fetchPublicMarketingSettings",
      sentryEndpoint: "/api/v1/system/settings/marketing-content",
    },
    queryFn: ({ signal }) => fetchPublicMarketingSettings({ signal }),
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    ...query,
    settings: query.data ?? null,
  };
}
