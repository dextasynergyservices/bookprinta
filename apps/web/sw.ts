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
  /**
   * Do NOT take over pages that are already open.
   *
   * `skipWaiting: true` activates a new worker immediately, so a page loaded
   * from the previous build suddenly sits under the new build's precache. Next.js
   * serves content-hashed chunks, and once precache cleanup has removed the old
   * ones, that page's next lazy import fails — the classic post-deploy
   * ChunkLoadError. Our users hit that window while uploading a 10MB manuscript
   * or completing a payment, which is the worst possible moment.
   *
   * Waiting means the new worker activates once the old clients are gone, so a
   * session is never swapped underneath itself.
   *
   * Trade-off: someone who keeps a tab open indefinitely will not receive CODE
   * updates until they close it. That is acceptable for a transactional flow,
   * and it does not affect CONTENT freshness — admin-managed content is fetched
   * NetworkFirst (see cache-rules.ts), so it updates immediately regardless of
   * which worker is active.
   *
   * To get both, add an "update available — reload" prompt driven by the
   * waiting worker, then this stays `false` and updates land on confirmation.
   */
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: pwaRuntimeCaching,
  fallbacks: {
    entries: offlineDocumentFallbackEntries,
  },
});

serwist.addEventListeners();
