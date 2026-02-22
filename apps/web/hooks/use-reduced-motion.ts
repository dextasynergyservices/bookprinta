"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` when the user prefers reduced motion (OS accessibility setting).
 * Listens for changes in real time (e.g., user toggles the setting).
 *
 * Usage:
 * ```tsx
 * const prefersReduced = useReducedMotion();
 * // Gate animations: if (prefersReduced) skip animation
 * ```
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}
