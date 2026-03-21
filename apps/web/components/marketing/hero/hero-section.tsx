"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { usePublicMarketingSettings } from "@/hooks/usePublicMarketingSettings";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { TypewriterSegment } from "./hero-typewriter";
import { HeroTypewriter } from "./hero-typewriter";
import { HeroVideo } from "./hero-video";
import { PursuitTyper } from "./pursuit-typer";

/* ─── Animation variants ─── */
const contentVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.18,
      delayChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: "easeOut" as const,
    },
  },
};

const ctaVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut" as const,
      delay: 0.05,
    },
  },
};

/* ─────────────────────────────────────────────
 * HeroSection
 *
 * Mobile-first hero with autoplay video.
 * - Mobile: video fills the background, title uses typewriter animation,
 *   remaining content reveals after typewriter completes.
 * - Desktop (lg+): 2-column layout — text left, video card right.
 *   Standard stagger animation (no typewriter).
 *
 * Slanted badges on the video animate (bend) on hover.
 * ───────────────────────────────────────────── */
export function HeroSection() {
  const t = useTranslations("hero");
  const prefersReducedMotion = useReducedMotion();
  const { settings } = usePublicMarketingSettings();

  /* ── Typewriter completion drives content reveal on ALL breakpoints ── */
  const [contentReady, setContentReady] = useState(false);

  const handleTypewriterComplete = useCallback(() => {
    setContentReady(true);
  }, []);

  /* ── Reduced-motion: reveal content immediately ── */
  useEffect(() => {
    if (prefersReducedMotion) {
      setContentReady(true);
    }
  }, [prefersReducedMotion]);

  /* ── Resolve hero text (admin overrides → i18n fallback) ── */
  const managedTitle = settings?.hero.title?.trim() ?? "";
  const usesManagedHero = managedTitle.length > 0;

  const heroSubtitle = settings?.hero.subtitle?.trim() || t("tagline");
  const primaryCtaLabel = settings?.hero.primaryCtaLabel?.trim() || t("cta");
  const secondaryCtaLabel = settings?.hero.secondaryCtaLabel?.trim() || t("secondary_cta");

  /* Typewriter uses the full flat title (not the split headline) */
  const typewriterText = usesManagedHero ? managedTitle.replace(/\n/g, " ") : t("title");

  /* ── Mixed-font segments for the typewriter ── */
  const heroSegments: TypewriterSegment[] = usesManagedHero
    ? [{ text: typewriterText }]
    : [
        { text: t("title_your") },
        { text: " " },
        { text: t("title_book") },
        { text: "\n" },
        {
          text: t("title_beautifully"),
          className: "hero-miller",
        },
        { text: " " },
        { text: t("title_printed") },
      ];

  return (
    <section
      className="relative min-h-[100dvh] overflow-hidden bg-primary"
      aria-label={typewriterText}
    >
      {/* ── Subtle grid pattern ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Mobile: Video as full-bleed background ── */}
      <div className="absolute inset-0 z-0 lg:hidden" aria-hidden="true">
        <HeroVideo className="h-full w-full" showBadges={false} />
      </div>

      {/* ── Mobile: Dark overlay for text readability ── */}
      <div
        className="hero-video-overlay pointer-events-none absolute inset-0 z-[1] lg:hidden"
        aria-hidden="true"
      />

      {/* ── Content ── */}
      <div className="relative z-[2] flex min-h-[100dvh] flex-col md:pb-14 lg:pb-16">
        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pt-20 pb-8 lg:px-8 lg:pt-24">
          {/* ── Grid: text left, video right on lg+ ── */}
          <div className="grid w-full grid-cols-1 items-start gap-8 lg:items-center lg:grid-cols-2 lg:gap-12">
            {/* ── Left: Text content ── */}
            <div className="flex max-w-2xl flex-col justify-center">
              {/* Headline */}
              <div className="mb-4 md:mb-5 lg:mb-8">
                <h1 className="whitespace-pre-line font-display text-[2.25rem] font-bold leading-[1.08] tracking-tight text-primary-foreground md:text-[2.75rem] lg:text-5xl xl:text-6xl">
                  <HeroTypewriter
                    segments={heroSegments}
                    onComplete={handleTypewriterComplete}
                    speed={prefersReducedMotion ? 0 : 60}
                    startDelay={prefersReducedMotion ? 0 : 600}
                  />
                </h1>
              </div>

              {/* Remaining content — reveals after typewriter on mobile, immediate on desktop */}
              <motion.div
                variants={contentVariants}
                initial={prefersReducedMotion ? "visible" : "hidden"}
                animate={contentReady ? "visible" : "hidden"}
              >
                {/* Tagline */}
                <motion.p
                  variants={itemVariants}
                  className="mb-5 max-w-lg font-sans text-sm leading-relaxed text-primary-foreground/70 md:mb-6 md:text-base lg:mb-10 lg:text-xl"
                >
                  {heroSubtitle}
                </motion.p>

                {/* CTAs */}
                <motion.div
                  variants={itemVariants}
                  className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6"
                >
                  <motion.div variants={ctaVariants}>
                    <Link
                      href="/pricing"
                      className={cn(
                        "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-accent px-6 py-2.5",
                        "font-display text-sm font-semibold tracking-wide text-accent-foreground",
                        "transition-all duration-300 hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/20",
                        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                      )}
                    >
                      {primaryCtaLabel}
                      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>

                  <motion.div variants={ctaVariants}>
                    <Link
                      href="/quote"
                      className={cn(
                        "font-display inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium tracking-wide text-primary-foreground/60",
                        "transition-colors duration-300 hover:text-primary-foreground"
                      )}
                    >
                      {secondaryCtaLabel}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </motion.div>
                </motion.div>

                {/* Pursuit typing animation */}
                <motion.div variants={itemVariants} className="mt-5 md:mt-6 lg:mt-10">
                  <PursuitTyper
                    prefix={t("pursuit")}
                    phrases={[t("pursuit_titles"), t("pursuit_copies")]}
                  />
                </motion.div>
              </motion.div>
            </div>

            {/* ── Right: Video card (desktop only) ── */}
            <motion.div
              className="relative hidden items-center justify-center lg:flex"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
            >
              {/* Glow behind video */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
              </div>

              <HeroVideo
                className="aspect-[4/5] w-full max-w-xs overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 lg:max-w-sm"
                showBadges={false}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
