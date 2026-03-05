"use client";

import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import {
  ResourceCard,
  ResourcesEmptyState,
  ResourcesErrorState,
  ResourcesLoadingState,
} from "@/components/marketing/resources";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useResources } from "@/hooks/use-resources";
import { Link } from "@/lib/i18n/navigation";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface ResourcesCategoryViewProps {
  categorySlug: string;
  categoryName: string;
}

export function ResourcesCategoryView({ categorySlug, categoryName }: ResourcesCategoryViewProps) {
  const t = useTranslations("resources");
  const prefersReducedMotion = useReducedMotion();
  const pageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const resourcesQuery = useResources({ category: categorySlug, limit: 9 });

  useEffect(() => {
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (heroRef.current) {
        gsap.from(".resources-category-hero-reveal", {
          opacity: 0,
          y: 34,
          duration: 0.82,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top 88%",
            once: true,
          },
        });
      }

      if (listRef.current) {
        gsap.from(listRef.current, {
          opacity: 0,
          y: 42,
          duration: 0.85,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: listRef.current,
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
      aria-labelledby="resources-category-heading"
    >
      <ScrollProgress />

      <section
        className="relative overflow-hidden border-b border-[#2A2A2A] bg-black"
        aria-labelledby="resources-category-heading"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#111111] to-[#111111]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,126,255,0.24),transparent_35%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_80%,rgba(0,126,255,0.16),transparent_42%)]" />
        </div>

        <div
          ref={heroRef}
          className="relative mx-auto flex w-full max-w-7xl flex-col px-5 pb-14 pt-28 md:px-10 md:pb-18 md:pt-36 lg:px-14 lg:pb-22 lg:pt-44"
        >
          <Link
            href="/resources"
            className="resources-category-hero-reveal inline-flex min-h-[44px] min-w-[44px] w-fit items-center gap-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#007eff] uppercase transition-colors duration-300 hover:text-[#4ca5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            {t("back_to_resources")}
          </Link>

          <p className="resources-category-hero-reveal mt-6 font-sans text-xs font-semibold tracking-[0.24em] text-white/55 uppercase md:text-sm">
            {t("title")}
          </p>

          <h1
            id="resources-category-heading"
            className="resources-category-hero-reveal mt-4 max-w-4xl font-display text-5xl leading-[0.95] font-bold tracking-tight text-white md:text-7xl lg:text-[5.4rem]"
          >
            {categoryName}
          </h1>

          <p className="resources-category-hero-reveal mt-6 max-w-2xl font-serif text-base leading-relaxed text-white/72 md:mt-7 md:text-lg lg:text-xl">
            {t("category_hero_subtitle", { category: categoryName })}
          </p>
        </div>
      </section>

      <section className="bg-[#111111]" aria-labelledby="resources-category-heading">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-10 md:py-10 lg:px-14 lg:py-12">
          <div ref={listRef}>
            {resourcesQuery.isInitialLoading ? (
              <ResourcesLoadingState cards={6} ariaLabel={categoryName} />
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
                clearLabel={t("back_to_resources")}
                hasActiveFilter={false}
              />
            ) : (
              <>
                <ul
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6"
                  aria-label={categoryName}
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
