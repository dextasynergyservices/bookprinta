"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ─── Register GSAP ScrollTrigger ─── */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LenisContextValue {
  lenis: Lenis | null;
  scrollTo: (
    target: string | number | HTMLElement,
    options?: Parameters<Lenis["scrollTo"]>[1]
  ) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const LenisContext = createContext<LenisContextValue>({
  lenis: null,
  scrollTo: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const tickerCallbackRef = useRef<((time: number) => void) | null>(null);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const destroyLenis = () => {
      const activeLenis = lenisRef.current;
      if (!activeLenis) return;

      const tickerCallback = tickerCallbackRef.current;
      if (tickerCallback) {
        gsap.ticker.remove(tickerCallback);
        tickerCallbackRef.current = null;
      }

      activeLenis.destroy();
      lenisRef.current = null;
      setLenis(null);
    };

    const initializeLenis = () => {
      // Avoid duplicate Lenis instances (especially during fast remounts/HMR).
      if (reducedMotionQuery.matches || lenisRef.current) return;

      const lenisInstance = new Lenis({
        // How long momentum lasts after scroll stops (in seconds)
        duration: 1.2,
        // Exponential ease — matches the weareresource.co.uk scroll feel
        easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
        // Vertical scrolling only
        orientation: "vertical",
        gestureOrientation: "vertical",
        // Sensitivity for touch scroll on mobile
        touchMultiplier: 2,
        // Sync touch scroll on mobile so Lenis manages it
        syncTouch: true,
        // Infinite scroll disabled
        infinite: false,
      });

      /* ── Bridge Lenis → GSAP ScrollTrigger ──
       * Without this, ScrollTrigger reads native scrollY while
       * Lenis manages its own scroll position — they're out of sync
       * and scroll-driven animations (like the book flip) won't fire. */
      lenisInstance.on("scroll", ScrollTrigger.update);

      const tickerCallback = (time: number) => {
        lenisInstance.raf(time * 1000);
      };

      gsap.ticker.add(tickerCallback);
      gsap.ticker.lagSmoothing(0);

      lenisRef.current = lenisInstance;
      tickerCallbackRef.current = tickerCallback;
      setLenis(lenisInstance);
    };

    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        destroyLenis();
        return;
      }

      initializeLenis();
    };

    initializeLenis();
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    return () => {
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      destroyLenis();
    };
  }, []);

  // Imperative scroll — used by nav links, "scroll to top", anchor buttons, etc.
  const scrollTo = useCallback<LenisContextValue["scrollTo"]>(
    (target, options) => {
      lenis?.scrollTo(target as string | number | HTMLElement, options);
    },
    [lenis]
  );

  return <LenisContext.Provider value={{ lenis, scrollTo }}>{children}</LenisContext.Provider>;
}

// ─── Internal context hook (used by useLenis public hook) ────────────────────

export function useLenisContext() {
  return useContext(LenisContext);
}
