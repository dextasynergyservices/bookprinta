"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

const VIDEO_SRC =
  "https://res.cloudinary.com/dxoorukfj/video/upload/v1774042773/BookPrinta_vid_othwsb.mp4";

interface HeroVideoProps {
  /** Additional container classes */
  className?: string;
  /** Whether to render the decorative slanted badges (default true) */
  showBadges?: boolean;
}

export function HeroVideo({ className, showBadges = true }: HeroVideoProps) {
  const t = useTranslations("hero");
  const [isHovered, setIsHovered] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover is decorative (badge bend animation only)
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Video ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {showBadges && (
        <>
          {/* ── Top-right slanted badge ── */}
          <motion.div
            className={cn(
              "absolute right-3 top-3 z-10 sm:right-5 sm:top-5 lg:right-4 lg:top-4",
              "rounded-md border border-accent/50 bg-accent/15 backdrop-blur-md",
              "px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-primary-foreground",
              "sm:px-4 sm:py-1.5 sm:text-xs"
            )}
            style={{ transformOrigin: "center center" }}
            initial={{ skewX: -6, rotate: -3, opacity: 0, y: -12 }}
            animate={{
              skewX: isHovered ? -14 : -6,
              rotate: isHovered ? -6 : -3,
              scaleX: isHovered ? 1.08 : 1,
              opacity: 1,
              y: 0,
            }}
            transition={{
              opacity: { duration: 0.6, delay: 1.2 },
              y: { duration: 0.6, delay: 1.2, ease: "easeOut" },
              skewX: { type: "spring", stiffness: 260, damping: 18 },
              rotate: { type: "spring", stiffness: 260, damping: 18 },
              scaleX: { type: "spring", stiffness: 260, damping: 18 },
            }}
          >
            {t("badge_top")}
          </motion.div>

          {/* ── Bottom-left slanted badge ── */}
          <motion.div
            className={cn(
              "absolute bottom-3 left-3 z-10 sm:bottom-5 sm:left-5 lg:bottom-4 lg:left-4",
              "rounded-md border border-primary-foreground/25 bg-primary/50 backdrop-blur-md",
              "px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-primary-foreground",
              "sm:px-4 sm:py-1.5 sm:text-xs"
            )}
            style={{ transformOrigin: "center center" }}
            initial={{ skewX: 6, rotate: 3, opacity: 0, y: 12 }}
            animate={{
              skewX: isHovered ? 14 : 6,
              rotate: isHovered ? 6 : 3,
              scaleX: isHovered ? 1.08 : 1,
              opacity: 1,
              y: 0,
            }}
            transition={{
              opacity: { duration: 0.6, delay: 1.5 },
              y: { duration: 0.6, delay: 1.5, ease: "easeOut" },
              skewX: { type: "spring", stiffness: 260, damping: 18 },
              rotate: { type: "spring", stiffness: 260, damping: 18 },
              scaleX: { type: "spring", stiffness: 260, damping: 18 },
            }}
          >
            {t("badge_bottom")}
          </motion.div>
        </>
      )}
    </div>
  );
}
