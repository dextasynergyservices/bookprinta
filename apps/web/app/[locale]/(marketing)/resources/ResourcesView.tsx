"use client";

import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  ResourceCard,
  ResourcesEmptyState,
  ResourcesErrorState,
  ResourcesLoadingState,
} from "@/components/marketing/resources";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useResourceCategories, useResources } from "@/hooks/use-resources";
import { useResourcesFilters } from "@/hooks/use-resources-filters";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function ResourcesViewInner() {
  const t = useTranslations("resources");
  const prefersReducedMotion = useReducedMotion();
  const pageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { category, setCategory, clearCategory, hasCategoryFilter } = useResourcesFilters();
  const categoriesQuery = useResourceCategories();
  const resourcesQuery = useResources({ category, limit: 9 });

  const categories = categoriesQuery.categories;

  const totalCount = useMemo(
    () => categories.reduce((sum, categoryItem) => sum + categoryItem.articleCount, 0),
    [categories]
  );

  const categoryPills = useMemo(
    () => [
      {
        slug: "",
        label: t("all_categories"),
        count: totalCount,
      },
      ...categories.map((categoryItem) => ({
        slug: categoryItem.slug,
        label: categoryItem.name,
        count: categoryItem.articleCount,
      })),
    ],
    [categories, t, totalCount]
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (heroRef.current) {
        gsap.from(".resources-hero-reveal", {
          opacity: 0,
          y: 36,
          duration: 0.85,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top 88%",
            once: true,
          },
        });
      }

      const sectionTargets = [filtersRef.current, listRef.current].filter(
        Boolean
      ) as HTMLDivElement[];

      for (const target of sectionTargets) {
        gsap.from(target, {
          opacity: 0,
          y: 42,
          duration: 0.85,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: "top 84%",
            once: true,
          },
        });
      }
    }, pageRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      ref={pageRef}
      className="min-h-screen bg-black text-white"
      aria-labelledby="resources-heading"
    >
      <ScrollProgress />

      <section
        className="relative overflow-hidden border-b border-[#2A2A2A] bg-black"
        aria-labelledby="resources-heading"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#111111] to-[#111111]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,126,255,0.24),transparent_35%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_80%,rgba(0,126,255,0.18),transparent_42%)]" />
        </div>

        <div
          ref={heroRef}
          className="relative mx-auto flex w-full max-w-7xl flex-col px-5 pb-16 pt-28 md:px-10 md:pb-20 md:pt-36 lg:px-14 lg:pb-24 lg:pt-44"
        >
          <p className="resources-hero-reveal mb-5 font-sans text-xs font-semibold tracking-[0.24em] text-white/55 uppercase md:text-sm">
            {t("title")}
          </p>
          <h1
            id="resources-heading"
            className="resources-hero-reveal max-w-3xl font-display text-5xl leading-[0.95] font-bold tracking-tight text-white md:text-7xl lg:text-[5.4rem]"
          >
            {t("title")}
          </h1>
          <p className="resources-hero-reveal mt-6 max-w-2xl font-serif text-base leading-relaxed text-white/72 md:mt-7 md:text-lg lg:text-xl">
            {t("hero_subtitle")}
          </p>
        </div>
      </section>

      <section className="bg-[#111111]" aria-labelledby="resources-category-filter-label">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-10 md:py-10 lg:px-14 lg:py-12">
          <div ref={filtersRef}>
            <p
              id="resources-category-filter-label"
              className="mb-4 font-sans text-xs font-semibold tracking-[0.18em] text-white/50 uppercase"
            >
              {t("category_filter_label")}
            </p>

            <nav
              className="-mx-5 overflow-x-auto px-5 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14"
              aria-label={t("category_filter_label")}
            >
              <ul className="flex min-w-max items-center gap-2">
                {categoryPills.map((pill) => {
                  const isActive =
                    pill.slug.length === 0 ? !hasCategoryFilter : pill.slug === category;

                  return (
                    <li key={pill.slug || "all"} className="list-none">
                      <button
                        type="button"
                        onClick={() => setCategory(pill.slug)}
                        className="relative inline-flex min-h-[44px] min-w-[44px] items-center gap-2 overflow-hidden rounded-full border border-[#2A2A2A] px-4 py-2 font-sans text-xs font-semibold tracking-[0.07em] text-white uppercase transition-colors duration-250 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
                        aria-pressed={isActive}
                      >
                        {isActive ? (
                          prefersReducedMotion ? (
                            <span className="absolute inset-0 bg-[#007eff]" aria-hidden="true" />
                          ) : (
                            <motion.span
                              layoutId="resources-pill-active"
                              className="absolute inset-0 bg-[#007eff]"
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              aria-hidden="true"
                            />
                          )
                        ) : null}

                        <span className="relative z-10">{pill.label}</span>
                        <span className="relative z-10 rounded-full bg-black/35 px-2 py-0.5 text-[0.65rem] text-white/85">
                          {pill.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <div ref={listRef} className="mt-7 md:mt-10">
            {resourcesQuery.isInitialLoading ? (
              <ResourcesLoadingState cards={6} ariaLabel={t("title")} />
            ) : resourcesQuery.isInitialError ? (
              <ResourcesErrorState
                message={t("error_loading")}
                retryLabel={t("retry")}
                onRetry={() => void resourcesQuery.refetch()}
              />
            ) : resourcesQuery.isEmpty ? (
              <ResourcesEmptyState
                title={t("no_articles")}
                description={t("no_articles_description")}
                clearLabel={t("clear_filters")}
                hasActiveFilter={hasCategoryFilter}
                onClear={clearCategory}
              />
            ) : (
              <>
                <ul
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6"
                  aria-label={t("title")}
                >
                  {resourcesQuery.items.map((item, index) => (
                    <motion.li
                      key={item.id}
                      className="list-none"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-60px" }}
                      transition={{
                        duration: 0.55,
                        ease: [0.22, 1, 0.36, 1],
                        delay: (index % 3) * 0.06,
                      }}
                    >
                      <ResourceCard
                        item={item}
                        index={index}
                        prefersReducedMotion={prefersReducedMotion}
                      />
                    </motion.li>
                  ))}
                </ul>

                {resourcesQuery.hasNextPage ? (
                  <div className="mt-8 flex justify-center md:mt-10">
                    <motion.div
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 360, damping: 24 }}
                    >
                      <Button
                        type="button"
                        onClick={() => void resourcesQuery.fetchNextPage()}
                        disabled={resourcesQuery.isFetchingNextPage}
                        className="min-h-[48px] min-w-[180px] rounded-full bg-[#007eff] px-6 font-sans text-xs font-bold tracking-[0.08em] text-white uppercase hover:bg-[#007eff]/90"
                      >
                        {resourcesQuery.isFetchingNextPage ? (
                          <>
                            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                            {t("loading_more")}
                          </>
                        ) : (
                          t("load_more")
                        )}
                      </Button>
                    </motion.div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

export function ResourcesView() {
  return (
    <Suspense>
      <ResourcesViewInner />
    </Suspense>
  );
}
