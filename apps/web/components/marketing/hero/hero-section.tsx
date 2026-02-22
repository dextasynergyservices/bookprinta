"use client";

import { motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { ScrollBook } from "./scroll-book";

/* ─── Register GSAP plugin ─── */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/* ─── Animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: "easeOut" as const,
    },
  },
};

const ctaVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut" as const,
      delay: 0.1,
    },
  },
};

/* ─────────────────────────────────────────────
 * HeroSection
 *
 * The outer section is tall (200vh) for scroll distance, but the
 * visible hero (book + text) is a sticky 100vh block pinned to the top.
 * This gives the scroll trigger room to drive the book flip while the
 * hero itself never visually exceeds 100vh.
 *
 * When the user scrolls past the section, the next sections
 * (wrapped in z-10) cover it.
 * ───────────────────────────────────────────── */
export function HeroSection() {
  const t = useTranslations("hero");
  const prefersReducedMotion = useReducedMotion();

  const sectionRef = useRef<HTMLElement>(null);

  /* ── Scroll progress state (0 → 1) drives book open/close ── */
  const [scrollProgress, setScrollProgress] = useState(0);

  /* ── GSAP scroll trigger for book flip ── */
  useEffect(() => {
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      /* ── Book flip scroll trigger ──
       * Scrubs from 0→1 as the user scrolls through the section.
       * The section is 200vh tall so there's a full 100vh of
       * scroll distance after the initial viewport for the flip. */
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        onUpdate: (self) => {
          setScrollProgress(self.progress);
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      ref={sectionRef}
      className="relative h-[130vh] lg:h-[150vh]"
      aria-label={`${t("headline_1")} ${t("headline_2")}`}
    >
      {/* ── Sticky 100vh hero — pins to viewport while scroll drives the book ── */}
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-primary">
        {/* Subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* ── Mobile only: Book as centered background ── */}
        <div className="absolute inset-0 z-0 lg:hidden" aria-hidden="true">
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ScrollBook scrollProgress={scrollProgress} bookScale={1.8} />
          </div>

          {/* Glow effect behind the book */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
          </div>
        </div>

        {/* ── Dark overlay so text is readable (mobile only) ── */}
        <div
          className="book-mobile-overlay absolute inset-0 z-[1] pointer-events-none lg:hidden"
          aria-hidden="true"
        />

        {/* ── Content layout ── */}
        <div className="relative z-[2] flex h-full flex-col">
          <div className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pt-24 pb-12 lg:px-8">
            {/* ── Grid: text left, book right on lg+ ── */}
            <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
              {/* Left: Text content */}
              <motion.div
                className="flex max-w-2xl flex-col justify-center"
                variants={containerVariants}
                initial={prefersReducedMotion ? "visible" : "hidden"}
                animate="visible"
              >
                {/* Headline */}
                <motion.div variants={itemVariants} className="mb-6 lg:mb-8">
                  <h1 className="font-display text-[2.5rem] font-bold leading-[1.05] tracking-tight text-primary-foreground md:text-6xl lg:text-7xl xl:text-8xl">
                    <span className="block">{t("headline_1")}</span>
                    <span className="block text-accent">{t("headline_2")}</span>
                  </h1>
                </motion.div>

                {/* Tagline */}
                <motion.p
                  variants={itemVariants}
                  className="mb-8 max-w-lg font-serif text-base leading-relaxed text-primary-foreground/70 md:text-lg lg:mb-10 lg:text-xl"
                >
                  {t("tagline")}
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
                        "group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-accent px-8 py-3.5",
                        "font-display text-sm font-semibold tracking-wide text-accent-foreground",
                        "transition-all duration-300 hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/20",
                        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                      )}
                    >
                      {t("cta")}
                      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>

                  <motion.div variants={ctaVariants}>
                    <Link
                      href="/showcase"
                      className={cn(
                        "font-display inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium tracking-wide text-primary-foreground/60",
                        "transition-colors duration-300 hover:text-primary-foreground"
                      )}
                    >
                      {t("secondary_cta")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </motion.div>
                </motion.div>
              </motion.div>

              {/* Right: Book (desktop/medium only) */}
              <div
                className="relative hidden items-center justify-center lg:flex"
                aria-hidden="true"
              >
                {/* Glow effect behind the book */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
                </div>
                <ScrollBook scrollProgress={scrollProgress} bookScale={1.4} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
