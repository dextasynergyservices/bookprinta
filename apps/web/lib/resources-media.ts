const FALLBACK_RESOURCE_IMAGE =
  "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80&fm=webp";

function normalizeUnsplashUrl(url: URL): string {
  if (!url.searchParams.has("auto")) url.searchParams.set("auto", "format");
  if (!url.searchParams.has("fit")) url.searchParams.set("fit", "crop");
  if (!url.searchParams.has("q")) url.searchParams.set("q", "80");
  if (!url.searchParams.has("w")) url.searchParams.set("w", "1600");
  if (!url.searchParams.has("fm")) url.searchParams.set("fm", "webp");

  return url.toString();
}

export function getSafeResourceImageUrl(url: string | null): string {
  if (!url) return FALLBACK_RESOURCE_IMAGE;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "images.unsplash.com") {
      return FALLBACK_RESOURCE_IMAGE;
    }

    return normalizeUnsplashUrl(parsed);
  } catch {
    return FALLBACK_RESOURCE_IMAGE;
  }
}
