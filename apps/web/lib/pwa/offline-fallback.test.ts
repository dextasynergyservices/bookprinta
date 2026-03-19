import {
  DEFAULT_OFFLINE_FALLBACK_PATH,
  isOfflineDocumentRequest,
  matchesOfflineFallbackRequest,
  offlineDocumentFallbackEntries,
  offlineFallbackUrls,
  resolveOfflineFallbackLocale,
  resolveOfflineFallbackPath,
} from "./offline-fallback";

type NavigationLikeRequest = Pick<Request, "destination" | "mode" | "url">;

function createRequest(
  url: string,
  overrides: Partial<NavigationLikeRequest> = {}
): NavigationLikeRequest {
  return {
    url,
    mode: "navigate",
    destination: "document",
    ...overrides,
  };
}

describe("offline fallback routing", () => {
  it("resolves locale-specific offline paths for localized routes", () => {
    expect(resolveOfflineFallbackLocale("/fr/pricing")).toBe("fr");
    expect(resolveOfflineFallbackLocale("/es/dashboard/orders")).toBe("es");
    expect(resolveOfflineFallbackPath("/fr/pricing")).toBe("/fr/offline");
    expect(resolveOfflineFallbackPath("/es/dashboard/orders")).toBe("/es/offline");
  });

  it("defaults unprefixed and english-prefixed paths to the compatibility offline page", () => {
    expect(resolveOfflineFallbackLocale("/")).toBe("en");
    expect(resolveOfflineFallbackLocale("/en/pricing")).toBe("en");
    expect(resolveOfflineFallbackLocale("/pricing")).toBe("en");
    expect(resolveOfflineFallbackLocale("/de/about")).toBe("en");
    expect(resolveOfflineFallbackPath("/pricing")).toBe(DEFAULT_OFFLINE_FALLBACK_PATH);
    expect(resolveOfflineFallbackPath("/en/pricing")).toBe(DEFAULT_OFFLINE_FALLBACK_PATH);
  });

  it("only treats document navigations as offline fallback candidates", () => {
    expect(isOfflineDocumentRequest(createRequest("https://bookprinta.test/fr/about"))).toBe(true);
    expect(
      isOfflineDocumentRequest(
        createRequest("https://bookprinta.test/api/v1/books", {
          mode: "cors",
          destination: "",
        })
      )
    ).toBe(false);
  });

  it("matches the correct fallback entry for each locale", () => {
    expect(
      matchesOfflineFallbackRequest(
        createRequest("https://bookprinta.test/fr/contact"),
        "/fr/offline"
      )
    ).toBe(true);
    expect(
      matchesOfflineFallbackRequest(
        createRequest("https://bookprinta.test/es/dashboard"),
        "/es/offline"
      )
    ).toBe(true);
    expect(
      matchesOfflineFallbackRequest(
        createRequest("https://bookprinta.test/pricing"),
        DEFAULT_OFFLINE_FALLBACK_PATH
      )
    ).toBe(true);
    expect(
      matchesOfflineFallbackRequest(
        createRequest("https://bookprinta.test/en/contact"),
        DEFAULT_OFFLINE_FALLBACK_PATH
      )
    ).toBe(true);
    expect(
      matchesOfflineFallbackRequest(
        createRequest("https://bookprinta.test/fr/contact"),
        DEFAULT_OFFLINE_FALLBACK_PATH
      )
    ).toBe(false);
  });

  it("exports explicit fallback entries for each supported locale", () => {
    expect(offlineFallbackUrls).toEqual(["/offline", "/fr/offline", "/es/offline"]);
    expect(offlineDocumentFallbackEntries.map((entry) => entry.url)).toEqual(offlineFallbackUrls);
  });
});
