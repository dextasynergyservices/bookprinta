import { offlineFallbackUrls } from "./offline-fallback";

const DEFAULT_PWA_BUILD_REVISION =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.SERWIST_BUILD_REVISION ??
  process.env.npm_package_version ??
  "bookprinta-pwa-offline";

export function createPwaPluginConfig(
  nodeEnv = process.env.NODE_ENV,
  buildRevision = DEFAULT_PWA_BUILD_REVISION
) {
  return {
    swSrc: "sw.ts",
    swDest: "public/sw.js",
    swUrl: "/sw.js",
    scope: "/",
    register: true,
    cacheOnNavigation: true,
    reloadOnOnline: false,
    additionalPrecacheEntries: offlineFallbackUrls.map((url) => ({
      url,
      revision: buildRevision,
    })),
    // Keep PWA plumbing out of dev and test to avoid turbopack noise and
    // confusing local behavior; production-like builds still register the SW.
    disable: nodeEnv !== "production",
  } as const;
}

export const pwaPluginConfig = createPwaPluginConfig();
