const DEFAULT_OFFLINE_LOCALE = "en";
const NON_DEFAULT_OFFLINE_LOCALES = ["fr", "es"] as const;
const SUPPORTED_OFFLINE_LOCALES = [DEFAULT_OFFLINE_LOCALE, ...NON_DEFAULT_OFFLINE_LOCALES] as const;

type OfflineLocale = (typeof SUPPORTED_OFFLINE_LOCALES)[number];
type NavigationLikeRequest = Pick<Request, "destination" | "mode" | "url">;

export const DEFAULT_OFFLINE_FALLBACK_PATH = "/offline";
export const offlineFallbackUrls = [
  DEFAULT_OFFLINE_FALLBACK_PATH,
  ...NON_DEFAULT_OFFLINE_LOCALES.map((locale) => `/${locale}/offline` as const),
] as const;

type OfflineFallbackPath = (typeof offlineFallbackUrls)[number];

function isOfflineLocale(value: string): value is OfflineLocale {
  return SUPPORTED_OFFLINE_LOCALES.includes(value as OfflineLocale);
}

export function isOfflineDocumentRequest(request: NavigationLikeRequest): boolean {
  return request.mode === "navigate" || request.destination === "document";
}

export function resolveOfflineFallbackLocale(pathname: string): OfflineLocale {
  const segments = pathname.split("/").filter(Boolean);
  const localeSegment = segments[0];

  if (localeSegment && isOfflineLocale(localeSegment)) {
    return localeSegment;
  }

  return DEFAULT_OFFLINE_LOCALE;
}

export function resolveOfflineFallbackPath(pathname: string): OfflineFallbackPath {
  const locale = resolveOfflineFallbackLocale(pathname);

  if (locale === DEFAULT_OFFLINE_LOCALE) {
    return DEFAULT_OFFLINE_FALLBACK_PATH;
  }

  return `/${locale}/offline`;
}

export function matchesOfflineFallbackRequest(
  request: NavigationLikeRequest,
  fallbackPath: OfflineFallbackPath
): boolean {
  if (!isOfflineDocumentRequest(request)) {
    return false;
  }

  return resolveOfflineFallbackPath(new URL(request.url).pathname) === fallbackPath;
}

export const offlineDocumentFallbackEntries = offlineFallbackUrls.map((fallbackPath) => ({
  url: fallbackPath,
  matcher({ request }: { request: Request }) {
    return matchesOfflineFallbackRequest(request, fallbackPath);
  },
}));
