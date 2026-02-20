"use client";

import Lenis from "lenis";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
  const rafRef = useRef<number | null>(null);

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
      // Mimic touch inertia on devices that support it
      syncTouch: false,
      // Infinite scroll disabled
      infinite: false,
    });

    setLenis(lenisInstance);

    // RAF loop — drives the Lenis animation engine at 60fps
    function raf(time: number) {
      lenisInstance.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    }
    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
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
