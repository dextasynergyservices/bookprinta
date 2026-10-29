import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

/** Fallback when the pricing endpoint is unreachable. Matches the API default. */
export const DEFAULT_EXTRA_PAGE_PRICE_NGN = 10;

export async function fetchExtraPagePrice(input: { signal?: AbortSignal } = {}): Promise<number> {
  const response = await fetchApiV1WithRefresh("/system/settings/pricing", {
    method: "GET",
    credentials: "include",
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load pricing settings");
  }

  const body = (await response.json()) as { extraPagePriceNgn?: unknown };
  const value = Number(body.extraPagePriceNgn);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EXTRA_PAGE_PRICE_NGN;
}
