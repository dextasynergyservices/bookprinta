import type { RuntimeCaching } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "serwist";
import {
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
} from "./cache-matchers";

const ONE_HOUR_IN_SECONDS = 60 * 60;
const THIRTY_MINUTES_IN_SECONDS = 30 * 60;
const FIVE_MINUTES_IN_SECONDS = 5 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONE_YEAR_IN_SECONDS = 365 * ONE_DAY_IN_SECONDS;

export const PWA_RUNTIME_POLICY_CONFIG = {
  paymentDocuments: {
    strategy: "NetworkOnly",
  },
  protectedApi: {
    strategy: "NetworkOnly",
  },
  marketingDocuments: {
    strategy: "StaleWhileRevalidate",
    cacheName: "marketing-pages",
    maxEntries: 64,
    maxAgeSeconds: ONE_HOUR_IN_SECONDS,
  },
  marketingRsc: {
    strategy: "StaleWhileRevalidate",
    cacheName: "marketing-rsc",
    maxEntries: 64,
    maxAgeSeconds: ONE_HOUR_IN_SECONDS,
  },
  dashboardDocuments: {
    strategy: "StaleWhileRevalidate",
    cacheName: "dashboard-shell-pages",
    maxEntries: 64,
    maxAgeSeconds: THIRTY_MINUTES_IN_SECONDS,
  },
  dashboardRsc: {
    strategy: "StaleWhileRevalidate",
    cacheName: "dashboard-shell-rsc",
    maxEntries: 64,
    maxAgeSeconds: THIRTY_MINUTES_IN_SECONDS,
  },
  readonlyApi: {
    strategy: "NetworkFirst",
    cacheName: "api-read-models",
    maxEntries: 128,
    maxAgeSeconds: FIVE_MINUTES_IN_SECONDS,
    networkTimeoutSeconds: 10,
  },
  fallbackGet: {
    strategy: "NetworkOnly",
    method: "GET",
  },
} as const;

function createExpirationPlugin(maxEntries: number, maxAgeSeconds: number) {
  return new ExpirationPlugin({
    maxEntries,
    maxAgeSeconds,
    maxAgeFrom: "last-used",
  });
}

function createCacheableResponsePlugin() {
  return new CacheableResponsePlugin({
    statuses: [0, 200],
  });
}

export const pwaRuntimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.destination === "document" && isPaymentDocumentPath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url }) =>
      isPaymentApiPath(url.pathname) ||
      isAuthApiPath(url.pathname) ||
      isPreviewApiPath(url.pathname) ||
      isDownloadApiPath(url.pathname) ||
      isUploadApiPath(url.pathname) ||
      isWebhookApiPath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.destination === "document" && isMarketingCachePath(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: PWA_RUNTIME_POLICY_CONFIG.marketingDocuments.cacheName,
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(
          PWA_RUNTIME_POLICY_CONFIG.marketingDocuments.maxEntries,
          PWA_RUNTIME_POLICY_CONFIG.marketingDocuments.maxAgeSeconds
        ),
      ],
    }),
  },
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.headers.get("RSC") === "1" && isMarketingCachePath(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: PWA_RUNTIME_POLICY_CONFIG.marketingRsc.cacheName,
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(
          PWA_RUNTIME_POLICY_CONFIG.marketingRsc.maxEntries,
          PWA_RUNTIME_POLICY_CONFIG.marketingRsc.maxAgeSeconds
        ),
      ],
    }),
  },
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.destination === "document" && isDashboardShellPath(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: PWA_RUNTIME_POLICY_CONFIG.dashboardDocuments.cacheName,
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(
          PWA_RUNTIME_POLICY_CONFIG.dashboardDocuments.maxEntries,
          PWA_RUNTIME_POLICY_CONFIG.dashboardDocuments.maxAgeSeconds
        ),
      ],
    }),
  },
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && request.headers.get("RSC") === "1" && isDashboardShellPath(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: PWA_RUNTIME_POLICY_CONFIG.dashboardRsc.cacheName,
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(
          PWA_RUNTIME_POLICY_CONFIG.dashboardRsc.maxEntries,
          PWA_RUNTIME_POLICY_CONFIG.dashboardRsc.maxAgeSeconds
        ),
      ],
    }),
  },
  {
    matcher: ({ url }) => isReadonlyApiPath(url.pathname),
    handler: new NetworkFirst({
      cacheName: PWA_RUNTIME_POLICY_CONFIG.readonlyApi.cacheName,
      networkTimeoutSeconds: PWA_RUNTIME_POLICY_CONFIG.readonlyApi.networkTimeoutSeconds,
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(
          PWA_RUNTIME_POLICY_CONFIG.readonlyApi.maxEntries,
          PWA_RUNTIME_POLICY_CONFIG.readonlyApi.maxAgeSeconds
        ),
      ],
    }),
  },
  {
    matcher: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
    handler: new CacheFirst({
      cacheName: "google-fonts-webfonts",
      plugins: [createCacheableResponsePlugin(), createExpirationPlugin(8, ONE_YEAR_IN_SECONDS)],
    }),
  },
  {
    matcher: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
    handler: new CacheFirst({
      cacheName: "google-fonts-stylesheets",
      plugins: [createCacheableResponsePlugin(), createExpirationPlugin(8, ONE_YEAR_IN_SECONDS)],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && /\.(?:eot|otf|ttc|ttf|woff|woff2|font\.css)$/i.test(url.pathname),
    handler: new CacheFirst({
      cacheName: "static-font-assets",
      plugins: [createCacheableResponsePlugin(), createExpirationPlugin(16, ONE_YEAR_IN_SECONDS)],
    }),
  },
  {
    matcher: /\/_next\/image\?url=.+$/i,
    handler: new StaleWhileRevalidate({
      cacheName: "next-image-assets",
      plugins: [createCacheableResponsePlugin(), createExpirationPlugin(64, ONE_DAY_IN_SECONDS)],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp)$/i.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "static-image-assets",
      plugins: [
        createCacheableResponsePlugin(),
        createExpirationPlugin(128, 30 * ONE_DAY_IN_SECONDS),
      ],
    }),
  },
  {
    matcher: /.*/i,
    method: PWA_RUNTIME_POLICY_CONFIG.fallbackGet.method,
    handler: new NetworkOnly(),
  },
];
