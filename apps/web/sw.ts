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
  // Keep updates waiting until the client explicitly confirms the reload.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: pwaRuntimeCaching,
  fallbacks: {
    entries: offlineDocumentFallbackEntries,
  },
});

serwist.addEventListeners();
