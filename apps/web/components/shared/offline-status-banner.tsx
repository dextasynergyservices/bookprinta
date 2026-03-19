"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function getOfflineBannerMotionProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}

export function OfflineStatusBanner() {
  const tCommon = useTranslations("common");
  const isOnline = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();
  const motionProps = getOfflineBannerMotionProps(prefersReducedMotion);

  return (
    <AnimatePresence initial={false}>
      {!isOnline ? (
        <motion.div
          {...motionProps}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sticky top-0 z-[70] w-full border-b border-white/8 bg-[#2A2A2A] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.04)] md:px-6"
        >
          <p className="font-sans text-center text-sm font-medium leading-snug text-white">
            {tCommon("offline_banner")}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
