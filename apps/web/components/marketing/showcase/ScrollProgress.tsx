"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useLenis } from "@/hooks/use-lenis";

/**
 * Scroll progress indicator — thin accent-blue bar fixed at the top of the viewport.
 * Width scales from 0→100% based on Lenis scroll progress (0→1).
 * Hidden when at the very top of the page.
 */
export function ScrollProgress() {
  const { lenis } = useLenis();
  const progress = useMotionValue(0);

  useEffect(() => {
    if (!lenis) return;

    const unsubscribe = lenis.on("scroll", ({ progress: p }: { progress: number }) => {
      progress.set(p);
    });

    return () => unsubscribe();
  }, [lenis, progress]);

  // Hide the bar when progress is effectively 0
  const opacity = useTransform(progress, [0, 0.01, 0.02], [0, 0.6, 1]);

  return (
    <motion.div
      className="pointer-events-none fixed top-0 right-0 left-0 z-50 h-[3px] origin-left bg-accent"
      style={{
        scaleX: progress,
        opacity,
      }}
      aria-hidden="true"
    />
  );
}
