import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { pwaRuntimeCaching } from "@/lib/pwa/cache-rules";
import { offlineDocumentFallbackEntries } from "@/lib/pwa/offline-fallback";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Activate new service worker immediately on deploy — no user prompt needed.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: pwaRuntimeCaching,
  fallbacks: {
    entries: offlineDocumentFallbackEntries,
  },
});

serwist.addEventListeners();
