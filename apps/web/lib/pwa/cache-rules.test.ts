jest.mock("serwist", () => {
  class CacheableResponsePlugin {
    constructor(public options: Record<string, unknown>) {}
  }

  class ExpirationPlugin {
    constructor(public options: Record<string, unknown>) {}
  }

  class BaseHandler {
    cacheName: string | null;
    networkTimeoutSeconds: number | null;
    plugins: unknown[];

    constructor(
      options: {
        cacheName?: string;
        networkTimeoutSeconds?: number;
        plugins?: unknown[];
      } = {}
    ) {
      this.cacheName = options.cacheName ?? "serwist-runtime";
      this.networkTimeoutSeconds = options.networkTimeoutSeconds ?? 0;
      this.plugins = options.plugins ?? [];
    }
  }

  class NetworkOnly extends BaseHandler {}
  class NetworkFirst extends BaseHandler {}
  class StaleWhileRevalidate extends BaseHandler {}
  class CacheFirst extends BaseHandler {}

  return {
    CacheFirst,
    CacheableResponsePlugin,
    ExpirationPlugin,
    NetworkFirst,
    NetworkOnly,
    StaleWhileRevalidate,
  };
});

import {
  isApiPath,
  isAuthApiPath,
  isDashboardShellPath,
  isDownloadApiPath,
  isMarketingCachePath,
  isPaymentApiPath,
  isPaymentDocumentPath,
  isPreviewApiPath,
  isReadonlyApiPath,
  isUploadApiPath,
  isWebhookApiPath,
  normalizeAppPath,
} from "./cache-matchers";
import { PWA_RUNTIME_POLICY_CONFIG, pwaRuntimeCaching } from "./cache-rules";

function resolveRuntimeCachingEntry(
  pathname: string,
  options?: {
    headers?: Record<string, string>;
    method?: string;
    sameOrigin?: boolean;
    destination?: RequestDestination;
  }
) {
  const headerEntries = Object.entries(options?.headers ?? {}).map(([key, value]) => [
    key.toLowerCase(),
    value,
  ]);
  const headers = {
    get: (name: string) => {
      const normalizedName = name.toLowerCase();
      return headerEntries.find(([key]) => key === normalizedName)?.[1] ?? null;
    },
  } as Pick<Headers, "get">;
  const request = {
    method: options?.method ?? "GET",
    headers,
    destination: options?.destination ?? "document",
  } as Pick<Request, "method" | "headers" | "destination"> as Request;
  const url = new URL(`https://bookprinta.test${pathname}`);
  const sameOrigin = options?.sameOrigin ?? true;

  return (
    pwaRuntimeCaching.find((entry) => {
      if (entry.method && entry.method !== request.method) {
        return false;
      }

      if (entry.matcher instanceof RegExp) {
        return entry.matcher.test(url.href);
      }

      if (typeof entry.matcher !== "function") {
        return false;
      }

      return entry.matcher({
        request,
        url,
        sameOrigin,
        event: undefined as never,
      });
    }) ?? null
  );
}

function describeResolvedEntry(entry: (typeof pwaRuntimeCaching)[number] | null) {
  if (!entry) {
    return null;
  }

  const handlerName = entry.handler.constructor.name;
  const rawNetworkTimeoutSeconds =
    (entry.handler as { networkTimeoutSeconds?: number; _networkTimeoutSeconds?: number })
      .networkTimeoutSeconds ??
    (entry.handler as { networkTimeoutSeconds?: number; _networkTimeoutSeconds?: number })
      ._networkTimeoutSeconds ??
    null;

  return {
    method: entry.method ?? null,
    handler: handlerName,
    cacheName:
      (entry.handler as { cacheName?: string; _cacheName?: string }).cacheName ??
      (entry.handler as { cacheName?: string; _cacheName?: string })._cacheName ??
      null,
    networkTimeoutSeconds: handlerName === "NetworkFirst" ? rawNetworkTimeoutSeconds : null,
  };
}

describe("PWA cache rules", () => {
  describe("critical runtime policy config", () => {
    it("pins the documented cache windows and strategy names for core routes", () => {
      expect(PWA_RUNTIME_POLICY_CONFIG).toMatchObject({
        paymentDocuments: { strategy: "NetworkOnly" },
        protectedApi: { strategy: "NetworkOnly" },
        marketingDocuments: {
          strategy: "StaleWhileRevalidate",
          cacheName: "marketing-pages",
          maxEntries: 64,
          maxAgeSeconds: 60 * 60,
        },
        marketingRsc: {
          strategy: "StaleWhileRevalidate",
          cacheName: "marketing-rsc",
          maxEntries: 64,
          maxAgeSeconds: 60 * 60,
        },
        dashboardDocuments: {
          strategy: "StaleWhileRevalidate",
          cacheName: "dashboard-shell-pages",
          maxEntries: 64,
          maxAgeSeconds: 30 * 60,
        },
        dashboardRsc: {
          strategy: "StaleWhileRevalidate",
          cacheName: "dashboard-shell-rsc",
          maxEntries: 64,
          maxAgeSeconds: 30 * 60,
        },
        readonlyApi: {
          strategy: "NetworkFirst",
          cacheName: "api-read-models",
          maxEntries: 128,
          maxAgeSeconds: 5 * 60,
          networkTimeoutSeconds: 10,
        },
        fallbackGet: {
          strategy: "NetworkOnly",
          method: "GET",
        },
      });
    });
  });

  describe("normalizeAppPath", () => {
    it("strips the configured locale prefix", () => {
      expect(normalizeAppPath("/fr/pricing")).toBe("/pricing");
      expect(normalizeAppPath("/es/dashboard/orders")).toBe("/dashboard/orders");
      expect(normalizeAppPath("/en")).toBe("/");
    });

    it("leaves non-locale paths untouched", () => {
      expect(normalizeAppPath("/pricing")).toBe("/pricing");
      expect(normalizeAppPath("/engineering")).toBe("/engineering");
    });
  });

  describe("document cache buckets", () => {
    it("recognizes cache-safe marketing routes", () => {
      expect(isMarketingCachePath("/")).toBe(true);
      expect(isMarketingCachePath("/fr/about")).toBe(true);
      expect(isMarketingCachePath("/es/resources/category/guides")).toBe(true);
      expect(isMarketingCachePath("/en/resources/how-to-self-publish")).toBe(true);
    });

    it("keeps payment and form-heavy routes out of the marketing cache", () => {
      expect(isMarketingCachePath("/checkout")).toBe(false);
      expect(isMarketingCachePath("/fr/quote")).toBe(false);
      expect(isMarketingCachePath("/terms")).toBe(false);
    });

    it("recognizes dashboard shell routes", () => {
      expect(isDashboardShellPath("/dashboard")).toBe(true);
      expect(isDashboardShellPath("/fr/dashboard/books/book_123")).toBe(true);
      expect(isDashboardShellPath("/admin")).toBe(false);
    });

    it("recognizes payment document routes that must stay network-only", () => {
      expect(isPaymentDocumentPath("/checkout")).toBe(true);
      expect(isPaymentDocumentPath("/fr/checkout/payment-return/paystack")).toBe(true);
      expect(isPaymentDocumentPath("/es/pay/quote-token")).toBe(true);
      expect(isPaymentDocumentPath("/payment/confirmation")).toBe(true);
      expect(isPaymentDocumentPath("/pricing")).toBe(false);
    });
  });

  describe("api cache buckets", () => {
    it("recognizes api paths", () => {
      expect(isApiPath("/api/v1/books")).toBe(true);
      expect(isApiPath("/api/v2/orders/tracking")).toBe(true);
      expect(isApiPath("/dashboard/books")).toBe(false);
    });

    it("recognizes payment, upload, preview, download, auth, and webhook exclusions", () => {
      expect(isPaymentApiPath("/api/v1/payments/initialize")).toBe(true);
      expect(isPaymentApiPath("/api/v1/admin/payments")).toBe(true);
      expect(isAuthApiPath("/api/v1/auth/login")).toBe(true);
      expect(isUploadApiPath("/api/v1/books/cm_book/upload")).toBe(true);
      expect(isUploadApiPath("/api/v1/admin/resources/cover-upload")).toBe(true);
      expect(isPreviewApiPath("/api/v1/books/cm_book/preview")).toBe(true);
      expect(isDownloadApiPath("/api/v1/admin/books/cm_book/download/final-pdf")).toBe(true);
      expect(isWebhookApiPath("/api/v1/webhooks/paystack")).toBe(true);
    });

    it("keeps read-only operational data eligible for network-first caching", () => {
      expect(isReadonlyApiPath("/api/v1/books")).toBe(true);
      expect(isReadonlyApiPath("/api/v1/orders/cm_order/tracking")).toBe(true);
      expect(isReadonlyApiPath("/api/v1/notifications/unread-count")).toBe(true);
    });

    it("prevents protected endpoints from entering the api data cache", () => {
      expect(isReadonlyApiPath("/api/v1/payments/gateways")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/pay/payment-token")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/books/cm_book/preview")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/books/cm_book/upload")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/admin/books/cm_book/download/final-pdf")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/auth/login")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/webhooks/paystack")).toBe(false);
      expect(isReadonlyApiPath("/api/v1/admin/payments")).toBe(false);
    });
  });

  describe("runtime caching resolution", () => {
    it("resolves payment documents to the first network-only guard", () => {
      expect(describeResolvedEntry(resolveRuntimeCachingEntry("/checkout"))).toEqual({
        method: null,
        handler: "NetworkOnly",
        cacheName: "serwist-runtime",
        networkTimeoutSeconds: null,
      });
    });

    it("resolves marketing documents and RSC payloads to the one-hour stale-while-revalidate caches", () => {
      expect(describeResolvedEntry(resolveRuntimeCachingEntry("/fr/about"))).toEqual({
        method: null,
        handler: "StaleWhileRevalidate",
        cacheName: "marketing-pages",
        networkTimeoutSeconds: null,
      });

      expect(
        describeResolvedEntry(
          resolveRuntimeCachingEntry("/fr/about", {
            headers: { RSC: "1" },
            destination: "",
          })
        )
      ).toEqual({
        method: null,
        handler: "StaleWhileRevalidate",
        cacheName: "marketing-rsc",
        networkTimeoutSeconds: null,
      });
    });

    it("resolves dashboard documents and RSC payloads to the dashboard shell cache", () => {
      expect(describeResolvedEntry(resolveRuntimeCachingEntry("/dashboard/books"))).toEqual({
        method: null,
        handler: "StaleWhileRevalidate",
        cacheName: "dashboard-shell-pages",
        networkTimeoutSeconds: null,
      });

      expect(
        describeResolvedEntry(
          resolveRuntimeCachingEntry("/dashboard/books", {
            headers: { RSC: "1" },
            destination: "",
          })
        )
      ).toEqual({
        method: null,
        handler: "StaleWhileRevalidate",
        cacheName: "dashboard-shell-rsc",
        networkTimeoutSeconds: null,
      });
    });

    it("resolves readonly api requests to the network-first read-model cache", () => {
      expect(
        describeResolvedEntry(resolveRuntimeCachingEntry("/api/v1/books", { destination: "" }))
      ).toEqual({
        method: null,
        handler: "NetworkFirst",
        cacheName: "api-read-models",
        networkTimeoutSeconds: 10,
      });
    });

    it("keeps payment and upload requests on network-only handlers before any fallback cache can match", () => {
      expect(
        describeResolvedEntry(
          resolveRuntimeCachingEntry("/api/v1/payments/initialize", { destination: "" })
        )
      ).toEqual({
        method: null,
        handler: "NetworkOnly",
        cacheName: "serwist-runtime",
        networkTimeoutSeconds: null,
      });

      expect(
        describeResolvedEntry(
          resolveRuntimeCachingEntry("/api/v1/books/cm_book/upload", { destination: "" })
        )
      ).toEqual({
        method: null,
        handler: "NetworkOnly",
        cacheName: "serwist-runtime",
        networkTimeoutSeconds: null,
      });
    });

    it("falls back to a GET-only network-only rule for uncategorized requests", () => {
      expect(
        describeResolvedEntry(
          resolveRuntimeCachingEntry("/some-unmatched-path", { destination: "" })
        )
      ).toEqual({
        method: "GET",
        handler: "NetworkOnly",
        cacheName: "serwist-runtime",
        networkTimeoutSeconds: null,
      });
    });
  });
});
