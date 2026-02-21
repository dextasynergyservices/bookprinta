"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthorModal } from "@/components/marketing/showcase/AuthorModal";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { ShowcaseFiltersBar } from "@/components/marketing/showcase/ShowcaseFilters";
import { ShowcaseGrid } from "@/components/marketing/showcase/ShowcaseGrid";
import { ShowcaseSearch } from "@/components/marketing/showcase/ShowcaseSearch";
import { useLenis } from "@/hooks/use-lenis";
import { useShowcaseCategories } from "@/hooks/use-showcase";
import { useShowcaseFilters } from "@/hooks/use-showcase-filters";
import type { ShowcaseEntry } from "@/types/showcase";

function ShowcaseViewInner() {
  const t = useTranslations("showcase");
  const { filters, setFilters, clearFilters, hasActiveFilters } = useShowcaseFilters();
  const { data: categoriesData } = useShowcaseCategories();
  const { lenis } = useLenis();

  const [authorModalEntry, setAuthorModalEntry] = useState<ShowcaseEntry | null>(null);
  const [authorModalOpen, setAuthorModalOpen] = useState(false);

  const categories = categoriesData?.categories ?? [];

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, []);

  // ── Scroll-linked motion values ──
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);

  useEffect(() => {
    if (!lenis) return;

    const unsubscribe = lenis.on("scroll", ({ scroll }: { scroll: number }) => {
      scrollY.set(scroll);
    });

    return () => unsubscribe();
  }, [lenis, scrollY]);

  // Hero text — fades out and shifts up as you scroll past
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const heroTranslateY = useTransform(scrollY, [0, 500], [0, -60]);

  // Hero background — moves at half the rate for depth parallax
  const bgTranslateY = useTransform(scrollY, [0, 500], [0, -30]);

  // Section divider — clip-path animates from flat to angled
  const dividerProgress = useTransform(scrollY, [200, 500], [0, 1]);
  const dividerClipPath = useTransform(dividerProgress, (p: number) => {
    // Interpolate from flat bottom to angled cut
    // flat: polygon(0 100%, 100% 100%, 100% 100%)
    // angled: polygon(0 100%, 100% 0%, 100% 100%)
    const topRightY = 100 - p * 100; // 100% → 0%
    return `polygon(0 100%, 100% ${topRightY}%, 100% 100%)`;
  });

  // ── Modal scroll lock ──
  useEffect(() => {
    if (authorModalOpen) {
      lenis?.stop();
    } else {
      lenis?.start();
    }

    return () => {
      lenis?.start();
    };
  }, [authorModalOpen, lenis]);

  const handleContactAuthor = useCallback((entry: ShowcaseEntry) => {
    setAuthorModalEntry(entry);
    setAuthorModalOpen(true);
  }, []);

  const handleAuthorModalChange = useCallback((open: boolean) => {
    setAuthorModalOpen(open);
    if (!open) {
      setAuthorModalEntry(null);
    }
  }, []);

  return (
    <section className="min-h-screen bg-background">
      {/* ── Scroll progress bar ── */}
      <ScrollProgress />

      {/* ── Hero — full-width dark, bold editorial, immersive height ── */}
      <div
        ref={heroRef}
        className="relative flex min-h-[70svh] overflow-hidden bg-primary md:min-h-[80svh]"
      >
        {/* Gradient overlay — with depth parallax (moves slower than text) */}
        <motion.div
          className="absolute inset-0 bg-linear-to-br from-primary via-primary to-accent/10"
          style={{ y: bgTranslateY }}
        />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-4 py-24 text-center sm:items-start sm:justify-start sm:px-5 sm:py-24 sm:text-left md:px-10 md:pb-28 md:pt-36 lg:px-14 lg:pb-36 lg:pt-44">
          <motion.div style={{ opacity: heroOpacity, y: heroTranslateY }}>
            <h1 className="font-display text-6xl font-bold leading-[1] tracking-tight text-primary-foreground md:text-7xl lg:text-[5.5rem]">
              {/* Line 1: "Stories" "worth" "telling." — stacked on mobile, inline on sm+ */}
              <span className="block sm:inline">{t("hero_line1").split(" ")[0]}</span>
              <span className="block sm:inline">
                {" "}
                {t("hero_line1").split(" ").slice(1).join(" ")}{" "}
              </span>
              <em className="block font-serif font-normal not-italic text-primary-foreground/50 sm:inline">
                {t("hero_line1_em")}
              </em>
              {/* Line break between line1 and line2 — always breaks */}
              <br />
              {/* Line 2: "Books" "worth" "holding." — stacked on mobile, inline on sm+ */}
              <span className="block sm:inline">{t("hero_line2").split(" ")[0]}</span>
              <span className="block sm:inline">
                {" "}
                {t("hero_line2").split(" ").slice(1).join(" ")}{" "}
              </span>
              <em className="block font-serif font-normal not-italic text-primary-foreground/50 sm:inline">
                {t("hero_line2_em")}
              </em>
            </h1>
          </motion.div>

          <motion.p
            style={{ opacity: heroOpacity, y: heroTranslateY }}
            className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-primary-foreground/45 sm:mt-6 sm:text-base md:mt-10 md:text-lg lg:text-xl"
          >
            {t("subtitle")}
          </motion.p>
        </div>

        {/* Bottom edge — animated angled cut (flat → angled as you scroll) */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-4 bg-background sm:h-6 md:h-10"
          style={{ clipPath: dividerClipPath }}
        />
      </div>

      {/* ── Filters + Content area ── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-5 sm:py-10 md:px-10 md:py-16 lg:px-14 lg:py-20">
        {/* Search + Filters bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 md:mb-14"
        >
          {/* Search */}
          <div className="mb-5 md:mb-8 md:max-w-lg">
            <ShowcaseSearch value={filters.q} onChange={(q) => setFilters({ q })} />
          </div>

          {/* Filters */}
          <ShowcaseFiltersBar
            filters={filters}
            onFilterChange={setFilters}
            categories={categories}
            availableYears={availableYears}
          />
        </motion.div>

        {/* Grid */}
        <ShowcaseGrid
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          onContactAuthor={handleContactAuthor}
        />
      </div>

      {/* Author modal */}
      <AuthorModal
        entry={authorModalEntry}
        open={authorModalOpen}
        onOpenChange={handleAuthorModalChange}
      />
    </section>
  );
}

export function ShowcaseView() {
  return (
    <Suspense>
      <ShowcaseViewInner />
    </Suspense>
  );
}
