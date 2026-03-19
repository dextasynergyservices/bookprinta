import type { AdminPublicMarketingSettingsResponse } from "@bookprinta/shared";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

export async function fetchPublicMarketingSettings(
  input: { signal?: AbortSignal } = {}
): Promise<AdminPublicMarketingSettingsResponse> {
  const response = await fetchApiV1WithRefresh("/system/settings/marketing-content", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load public marketing settings");
  }

  return (await response.json()) as AdminPublicMarketingSettingsResponse;
}
