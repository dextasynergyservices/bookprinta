"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

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

  useEffect(() => {
    // Respect prefers-reduced-motion — do not init Lenis, use native scroll
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

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

    gsap.ticker.add((time) => {
      lenisInstance.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    setLenis(lenisInstance);

    // Note: Lenis RAF is now driven by gsap.ticker above
    // (removed manual requestAnimationFrame loop to avoid double-updates)

    return () => {
      gsap.ticker.remove(lenisInstance.raf);
      lenisInstance.destroy();
      setLenis(null);
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
