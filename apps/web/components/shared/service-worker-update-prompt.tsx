"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePathname } from "@/lib/i18n/navigation";
import { reloadForServiceWorkerUpdate } from "@/lib/pwa/reload-for-update";
import {
  getSerwistWindowController,
  isSensitiveServiceWorkerUpdatePath,
  type SerwistWindowController,
  type SerwistWindowEvent,
} from "@/lib/pwa/service-worker-update";

type PromptMotionProps = {
  initial: { opacity: number; y: number };
  animate: { opacity: number; y: number };
  exit: { opacity: number; y: number };
  transition: { duration: number; ease?: readonly [number, number, number, number] };
};

export function getServiceWorkerUpdatePromptMotionProps(
  prefersReducedMotion: boolean
): PromptMotionProps {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 16 },
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  };
}

export function ServiceWorkerUpdatePrompt() {
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const motionProps = getServiceWorkerUpdatePromptMotionProps(prefersReducedMotion);
  const serwistRef = useRef<SerwistWindowController | null>(null);
  const isReloadingRef = useRef(false);
  const [hasWaitingUpdate, setHasWaitingUpdate] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const isSensitiveFlow = useMemo(() => isSensitiveServiceWorkerUpdatePath(pathname), [pathname]);
  const shouldShowPrompt = hasWaitingUpdate && !isDismissed && !isSensitiveFlow;

  useEffect(() => {
    isReloadingRef.current = isReloading;
  }, [isReloading]);

  useEffect(() => {
    const serwist = getSerwistWindowController();
    serwistRef.current = serwist;

    // Bail only in SSR or if browser doesn't support service workers at all.
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let isMounted = true;

    const markWaitingUpdate = () => {
      if (!isMounted) return;
      setHasWaitingUpdate(true);
      setIsDismissed(false);
    };

    const checkWaitingRegistration = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!isMounted || !registration?.waiting) {
          return;
        }

        markWaitingUpdate();
      } catch {
        // Ignore registration lookup failures so the rest of the app shell keeps working.
      }
    };

    const requestUpdateCheck = async () => {
      // Try Serwist's update() first, fall back to native registration.update()
      if (serwist?.update) {
        void serwist.update();
      } else {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.update();
        } catch {
          // Ignore update check failures
        }
      }
      void checkWaitingRegistration();
    };

    // --- Serwist event listeners (only when window.serwist is available) ---
    const handleWaiting = (_event: SerwistWindowEvent) => {
      markWaitingUpdate();
    };

    const handleControlling = (_event: SerwistWindowEvent) => {
      if (!isMounted || !isReloadingRef.current) {
        return;
      }

      reloadForServiceWorkerUpdate();
    };

    if (serwist) {
      serwist.addEventListener("waiting", handleWaiting);
      serwist.addEventListener("controlling", handleControlling);
    }

    // --- Native SW listeners (always active as fallback) ---

    // Detect when a new SW takes over (works even without window.serwist)
    const handleControllerChange = () => {
      if (!isMounted || !isReloadingRef.current) {
        return;
      }
      reloadForServiceWorkerUpdate();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    // Watch for newly installing workers that enter the "waiting" state
    const setupUpdateFoundListener = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              markWaitingUpdate();
            }
          });
        });
      } catch {
        // Ignore
      }
    };

    // --- Focus / visibility triggers update checks ---
    const handleWindowFocus = () => {
      void requestUpdateCheck();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestUpdateCheck();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial checks
    void checkWaitingRegistration();
    void setupUpdateFoundListener();

    return () => {
      isMounted = false;
      if (serwist) {
        serwist.removeEventListener("waiting", handleWaiting);
        serwist.removeEventListener("controlling", handleControlling);
      }
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleReload = () => {
    isReloadingRef.current = true;
    setIsReloading(true);

    const serwist = serwistRef.current;

    if (serwist) {
      serwist.messageSkipWaiting();
      return;
    }

    // Native fallback: send SKIP_WAITING directly to the waiting service worker
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          // No waiting worker found — force reload as last resort
          reloadForServiceWorkerUpdate();
        }
      })
      .catch(() => {
        reloadForServiceWorkerUpdate();
      });
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  return (
    <AnimatePresence initial={false}>
      {shouldShowPrompt ? (
        <motion.section
          {...motionProps}
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] sm:inset-x-6"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-md rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-4 shadow-[0_22px_64px_rgba(0,0,0,0.48)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-[#007eff]/35 bg-[#071320] text-[#007eff]">
                <RefreshCw className="size-4" aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold tracking-tight text-white">
                  {tCommon("sw_update_title")}
                </p>
                <p className="mt-1 font-sans text-sm leading-6 text-[#d0d0d0]">
                  {tCommon("sw_update_body")}
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleReload}
                    disabled={isReloading}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {isReloading ? tCommon("sw_update_reloading") : tCommon("sw_update_reload")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    disabled={isReloading}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white/80 transition-colors duration-150 hover:border-[#007eff] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {tCommon("sw_update_later")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
