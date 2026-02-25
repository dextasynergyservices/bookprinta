"use client";

import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BookOpen, Check, Shield, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import type { PackageBase, PackageCategory } from "@/hooks/usePackages";
import { usePackageCategories } from "@/hooks/usePackages";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── Helpers ───

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

// ─── Category Tabs — Mobile compact pills, desktop full pills ───

function CategoryTabs({
  categories,
  activeSlug,
  onSelect,
}: {
  categories: PackageCategory[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("pricing");
  const activeCategory = categories.find((c) => c.slug === activeSlug);

  return (
    <div className="category-tabs mx-auto mb-10 w-full md:mb-14">
      {/* ── Mobile: Compact pills (desktop style, smaller) ── */}
      <div className="px-5 md:hidden">
        <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div
            className="inline-flex min-w-max items-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5"
            role="tablist"
            aria-label={t("title")}
          >
            {categories.map((cat) => {
              const isActive = activeSlug === cat.slug;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${cat.slug}`}
                  onClick={() => onSelect(cat.slug)}
                  className={cn(
                    "relative shrink-0 rounded-lg px-3 py-1.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary",
                    isActive
                      ? "text-accent-foreground"
                      : "text-primary-foreground/55 hover:text-primary-foreground/85"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="category-tab-pill-mobile"
                      className="absolute inset-0 rounded-lg bg-accent shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="font-display text-xs font-semibold">{cat.name}</span>
                    <span
                      className={cn(
                        "font-sans text-[10px] font-medium tabular-nums",
                        isActive ? "text-accent-foreground/70" : "text-primary-foreground/35"
                      )}
                    >
                      {cat.copies}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Desktop: Wrapped pills (supports many categories) ── */}
      <div className="hidden px-5 md:block">
        <div
          className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5"
          role="tablist"
          aria-label={t("title")}
        >
          {categories.map((cat) => {
            const isActive = activeSlug === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${cat.slug}`}
                onClick={() => onSelect(cat.slug)}
                className={cn(
                  "relative rounded-lg px-4 py-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary",
                  isActive
                    ? "text-accent-foreground"
                    : "text-primary-foreground/50 hover:text-primary-foreground/80"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="category-tab-pill"
                    className="absolute inset-0 rounded-lg bg-accent shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                  <span className="font-display text-sm font-semibold">{cat.name}</span>
                  <span
                    className={cn(
                      "font-sans text-xs font-medium tabular-nums",
                      isActive ? "text-accent-foreground/60" : "text-primary-foreground/30"
                    )}
                  >
                    {cat.copies}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active category description with copies count */}
      <AnimatePresence mode="wait">
        {activeCategory && (
          <motion.p
            key={activeCategory.slug}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-3 max-w-md px-5 text-center font-serif text-xs text-primary-foreground/40 md:mt-4 md:text-sm"
          >
            <span className="font-semibold text-accent">
              {t("copies_count", { count: activeCategory.copies })}
            </span>
            {activeCategory.description && (
              <>
                <span className="mx-1.5">·</span>
                {activeCategory.description}
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Copy Count Badge ───

function CopyCountGrid({ copies }: { copies: { A4: number; A5: number; A6: number } }) {
  const t = useTranslations("pricing");
  const sizes = [
    { label: t("copies_a5"), count: copies.A5 },
    { label: t("copies_a6"), count: copies.A6 },
    { label: t("copies_a4"), count: copies.A4 },
  ] as const;

  return (
    <div className="mt-5 mb-6">
      <p className="mb-2.5 font-sans text-[10px] font-semibold tracking-widest text-primary-foreground/30 uppercase">
        {t("copies_per_size")}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {sizes.map((size) => (
          <div
            key={size.label}
            className="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-2.5 transition-colors hover:border-white/[0.1]"
          >
            <span className="font-display text-lg font-bold text-primary-foreground">
              {size.count}
            </span>
            <span className="font-sans text-[10px] font-medium text-primary-foreground/40 uppercase">
              {size.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single Package Card ───

function PackageCard({
  pkg,
  isPopular,
  categorySlug,
  index,
}: {
  pkg: PackageBase;
  isPopular: boolean;
  categorySlug: string;
  index: number;
}) {
  const t = useTranslations("pricing");

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full pt-3"
    >
      {/* Popular badge */}
      {isPopular && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
          className="absolute top-0 left-1/2 z-20 -translate-x-1/2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 font-display text-[11px] font-bold tracking-wider text-accent-foreground uppercase shadow-[0_4px_16px_rgba(0,126,255,0.3)]">
            <Sparkles className="size-3" aria-hidden="true" />
            {t("most_popular")}
          </span>
        </motion.div>
      )}

      <div
        className={cn(
          "group relative flex h-full w-full flex-col rounded-2xl border p-6 transition-all duration-300 lg:p-8",
          isPopular
            ? "border-accent/30 bg-accent/[0.04] shadow-[0_0_60px_rgba(0,126,255,0.06)] hover:border-accent/50 hover:shadow-[0_0_80px_rgba(0,126,255,0.1)]"
            : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]"
        )}
      >
        {/* Subtle gradient overlay for popular card */}
        {isPopular && (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-50"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(0,126,255,0.08) 0%, transparent 60%)",
            }}
            aria-hidden="true"
          />
        )}

        {/* Package name */}
        <h3 className="relative font-display text-xl font-bold text-primary-foreground lg:text-2xl">
          {pkg.name}
        </h3>

        {/* Price */}
        <div className="relative mt-5">
          <p className="font-sans text-[10px] font-semibold tracking-widest text-primary-foreground/30 uppercase">
            {t("starting_from")}
          </p>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="font-sans text-3xl font-bold tracking-tight text-primary-foreground lg:text-4xl">
              {formatPrice(pkg.basePrice)}
            </span>
          </div>
        </div>

        {/* Description */}
        {pkg.description && (
          <p className="relative mt-3 font-serif text-sm leading-relaxed text-primary-foreground/45">
            {pkg.description}
          </p>
        )}

        {/* Page limit + ISBN pills */}
        <div className="relative mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-sans text-xs font-medium text-primary-foreground/60">
            <BookOpen className="size-3.5" aria-hidden="true" />
            {t("pages_up_to", { limit: pkg.pageLimit })}
          </span>
          {pkg.includesISBN && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.08] px-3 py-1.5 font-sans text-xs font-medium text-accent">
              <Shield className="size-3.5" aria-hidden="true" />
              {t("isbn_included")}
            </span>
          )}
        </div>

        {/* Copies per size grid */}
        <CopyCountGrid copies={pkg.features.copies} />

        {/* Feature list */}
        <div className="relative mb-8 flex-grow">
          <p className="mb-3 font-sans text-[10px] font-semibold tracking-widest text-primary-foreground/30 uppercase">
            {t("whats_included")}
          </p>
          <ul className="flex flex-col gap-3">
            {pkg.features.items.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent/10">
                  <Check className="size-3 text-accent" aria-hidden="true" />
                </div>
                <span className="font-sans text-sm leading-snug text-primary-foreground/65">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <Link
          href={`/checkout?package=${pkg.slug}&category=${categorySlug}`}
          className={cn(
            "relative mt-auto flex h-12 w-full items-center justify-center rounded-full px-6 text-center font-display text-sm font-semibold tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-primary",
            isPopular
              ? "bg-accent text-accent-foreground shadow-[0_4px_16px_rgba(0,126,255,0.2)] hover:shadow-[0_8px_24px_rgba(0,126,255,0.3)] hover:brightness-110 focus:ring-accent"
              : "border border-white/15 bg-transparent text-primary-foreground hover:border-white/30 hover:bg-white/[0.06] focus:ring-white/40"
          )}
        >
          {t("select_package")}
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Category Panel ───

function CategoryPanel({ category, isActive }: { category: PackageCategory; isActive: boolean }) {
  const midIndex = Math.floor(category.packages.length / 2);

  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key={category.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          id={`panel-${category.slug}`}
          role="tabpanel"
          aria-label={category.name}
        >
          {/* Package cards grid */}
          <div
            className={cn(
              "mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-5 md:gap-6 lg:gap-8 lg:px-8",
              category.packages.length === 1 && "max-w-md md:grid-cols-1",
              category.packages.length === 2 && "max-w-3xl md:grid-cols-2",
              category.packages.length >= 3 && "md:grid-cols-2 lg:grid-cols-3"
            )}
          >
            {category.packages.map((pkg, idx) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                isPopular={category.packages.length > 1 && idx === midIndex}
                categorySlug={category.slug}
                index={idx}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Loading Skeleton ───

function PricingCardsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      {/* Category tabs skeleton — compact pills on mobile, full pills on desktop */}
      <div className="mx-auto mb-10 px-5 md:mb-14">
        <div className="overflow-x-auto md:hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
            ))}
          </div>
        </div>
        <div className="hidden px-5 md:block">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-9 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
            ))}
          </div>
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 lg:p-8"
          >
            <div className="h-6 w-32 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
            <div className="h-10 w-40 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
            <div className="mt-auto h-12 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

export function PricingCards() {
  const t = useTranslations("pricing");
  const { data: categories, isLoading, isError, refetch } = usePackageCategories();
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set default active category once data loads
  const activeSlug =
    activeCategorySlug ?? (categories && categories.length > 0 ? categories[0].slug : "");

  const handleCategorySelect = useCallback((slug: string) => {
    setActiveCategorySlug(slug);
  }, []);

  useGSAP(
    () => {
      if (isLoading || isError || !categories?.length) return;

      gsap.from(".category-tabs", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
      });
    },
    { dependencies: [isLoading, isError, categories], scope: containerRef }
  );

  if (isLoading) {
    return <PricingCardsSkeleton />;
  }

  if (isError || !categories) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center text-primary-foreground"
        role="alert"
      >
        <p className="mb-4 font-serif text-lg">{t("error")}</p>
        <button
          onClick={() => refetch()}
          type="button"
          className="rounded-full bg-accent px-8 py-3 font-display text-sm font-semibold tracking-wide text-accent-foreground transition-all hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <p className="font-serif text-lg text-primary-foreground/60">{t("no_packages")}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* Category tabs — only show if more than one category */}
      {categories.length > 1 && (
        <CategoryTabs
          categories={categories}
          activeSlug={activeSlug}
          onSelect={handleCategorySelect}
        />
      )}

      {/* Category panels */}
      {categories.map((category) => (
        <CategoryPanel
          key={category.id}
          category={category}
          isActive={category.slug === activeSlug}
        />
      ))}
    </div>
  );
}
