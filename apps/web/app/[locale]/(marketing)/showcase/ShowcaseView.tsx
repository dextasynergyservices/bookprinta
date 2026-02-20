"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useMemo, useState } from "react";
import { AuthorModal } from "@/components/marketing/showcase/AuthorModal";
import { ShowcaseFiltersBar } from "@/components/marketing/showcase/ShowcaseFilters";
import { ShowcaseGrid } from "@/components/marketing/showcase/ShowcaseGrid";
import { ShowcaseSearch } from "@/components/marketing/showcase/ShowcaseSearch";
import { useShowcaseCategories } from "@/hooks/use-showcase";
import { useShowcaseFilters } from "@/hooks/use-showcase-filters";
import type { ShowcaseEntry } from "@/types/showcase";

function ShowcaseViewInner() {
  const t = useTranslations("showcase");
  const { filters, setFilters, clearFilters, hasActiveFilters } = useShowcaseFilters();
  const { data: categoriesData } = useShowcaseCategories();

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
      {/* ── Hero — full-width dark, bold editorial, immersive height ── */}
      <div className="relative flex min-h-[70svh] overflow-hidden bg-primary md:min-h-[80svh]">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-br from-primary via-primary to-accent/10" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-4 py-24 text-center sm:items-start sm:justify-start sm:px-5 sm:py-24 sm:text-left md:px-10 md:pb-28 md:pt-36 lg:px-14 lg:pb-36 lg:pt-44">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="font-display text-[2rem] font-bold leading-[1.08] tracking-tight text-primary-foreground sm:text-[2.5rem] md:text-6xl lg:text-7xl">
              {t("hero_line1")}{" "}
              <em className="font-serif font-normal not-italic text-primary-foreground/50">
                {t("hero_line1_em")}
              </em>
              <br className="hidden sm:block" /> {t("hero_line2")}{" "}
              <em className="font-serif font-normal not-italic text-primary-foreground/50">
                {t("hero_line2_em")}
              </em>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-xl font-serif text-sm leading-relaxed text-primary-foreground/45 sm:mt-6 sm:text-base md:mt-10 md:text-lg lg:text-xl"
          >
            {t("subtitle")}
          </motion.p>
        </div>

        {/* Bottom edge — angled cut */}
        <div
          className="absolute bottom-0 left-0 right-0 h-4 bg-background sm:h-6 md:h-10"
          style={{ clipPath: "polygon(0 100%, 100% 0, 100% 100%)" }}
        />
      </div>

      {/* ── Filters + Content area ── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-5 sm:py-10 md:px-10 md:py-16 lg:px-14 lg:py-20">
        {/* Search + Filters bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
