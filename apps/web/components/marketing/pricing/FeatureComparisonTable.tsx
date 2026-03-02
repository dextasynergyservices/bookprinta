"use client";

import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, ChevronDown, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { PackageBase } from "@/hooks/usePackages";
import { usePackageCategories } from "@/hooks/usePackages";
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

/**
 * Collect all unique feature strings across packages in a category.
 * Preserves insertion order from the packages' feature lists.
 */
function collectUniqueFeatures(packages: PackageBase[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const pkg of packages) {
    for (const item of pkg.features.items) {
      if (!seen.has(item)) {
        seen.add(item);
        ordered.push(item);
      }
    }
  }

  return ordered;
}

// ─── Main Component ───

export function FeatureComparisonTable() {
  const t = useTranslations("pricing");
  const { data: categories, isLoading } = usePackageCategories();
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Active category for the comparison table
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);

  // Mobile: active package column index
  const [activePkgIdx, setActivePkgIdx] = useState(0);

  // Dropdown state for mobile package selector
  const [pkgDropdownOpen, setPkgDropdownOpen] = useState(false);
  const pkgDropdownRef = useRef<HTMLDivElement>(null);

  // Close package dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pkgDropdownRef.current && !pkgDropdownRef.current.contains(e.target as Node)) {
        setPkgDropdownOpen(false);
      }
    }
    if (pkgDropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [pkgDropdownOpen]);

  const activeCategory = useMemo(() => {
    if (!categories?.length) return null;
    const slug = activeCategorySlug ?? categories[0].slug;
    return categories.find((c) => c.slug === slug) ?? categories[0];
  }, [categories, activeCategorySlug]);

  const allFeatures = useMemo(() => {
    if (!activeCategory) return [];
    return collectUniqueFeatures(activeCategory.packages);
  }, [activeCategory]);

  // Reset mobile tab when category changes
  const handleCategoryChange = (slug: string) => {
    setActiveCategorySlug(slug);
    setActivePkgIdx(0);
  };

  useGSAP(
    () => {
      if (prefersReducedMotion || isLoading || !categories?.length) return;

      gsap.from(".compare-heading", {
        y: 30,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
      });

      gsap.from(".feature-row", {
        y: 16,
        opacity: 0,
        duration: 0.4,
        stagger: 0.04,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".compare-table",
          start: "top 90%",
        },
      });
    },
    {
      dependencies: [prefersReducedMotion, isLoading, categories, activeCategorySlug],
      scope: containerRef,
    }
  );

  if (isLoading || !categories?.length || !activeCategory) {
    return null;
  }

  const packages = activeCategory.packages;

  return (
    <div ref={containerRef} className="mx-auto max-w-7xl px-5 py-16 md:py-24 lg:px-8">
      {/* Section heading */}
      <div className="compare-heading mb-10 text-center md:mb-14">
        <h2 className="font-display text-3xl font-bold text-primary-foreground md:text-4xl lg:text-5xl">
          {t("compare_title")}
        </h2>
        <p className="mx-auto mt-4 max-w-lg font-serif text-base text-primary-foreground/50 md:text-lg">
          {t("compare_subtitle")}
        </p>
      </div>

      {/* Category filter — compact pills on mobile, wrapped pills on desktop */}
      {categories.length > 1 && (
        <div className="mb-8 md:mb-12">
          {/* Mobile: Compact pills */}
          <div className="px-5 md:hidden">
            <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div
                className="inline-flex min-w-max items-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5"
                role="tablist"
                aria-label={t("compare_title")}
              >
                {categories.map((cat) => {
                  const isActive = activeCategory.slug === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleCategoryChange(cat.slug)}
                      className={cn(
                        "relative shrink-0 min-h-11 min-w-11 rounded-lg px-3 py-1.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary",
                        isActive
                          ? "text-accent-foreground"
                          : "text-primary-foreground/55 hover:text-primary-foreground/85"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="compare-tab-pill-mobile"
                          className="absolute inset-0 rounded-lg bg-accent shadow-sm"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 font-display text-xs font-semibold whitespace-nowrap">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Desktop: Wrapped pills */}
          <div className="hidden px-5 md:block">
            <div
              className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5"
              role="tablist"
              aria-label={t("compare_title")}
            >
              {categories.map((cat) => {
                const isActive = activeCategory.slug === cat.slug;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleCategoryChange(cat.slug)}
                    className={cn(
                      "relative min-h-11 min-w-11 rounded-lg px-4 py-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary",
                      isActive
                        ? "text-accent-foreground"
                        : "text-primary-foreground/50 hover:text-primary-foreground/80"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="compare-tab-pill"
                        className="absolute inset-0 rounded-lg bg-accent shadow-sm"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 font-display text-sm font-semibold">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile package switcher — dropdown */}
      {packages.length > 1 && (
        <div className="relative mx-auto mb-6 max-w-xs px-5 md:hidden" ref={pkgDropdownRef}>
          <button
            type="button"
            onClick={() => setPkgDropdownOpen((o) => !o)}
            className="flex min-h-11 min-w-11 w-full items-center justify-between rounded-xl border border-accent/20 bg-accent/[0.04] px-4 py-3 transition-colors hover:border-accent/30"
            aria-expanded={pkgDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-primary-foreground">
                {packages[activePkgIdx]?.name}
              </span>
              <span className="font-sans text-xs font-semibold text-accent">
                {formatPrice(packages[activePkgIdx]?.basePrice)}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-primary-foreground/40 transition-transform duration-200",
                pkgDropdownOpen && "rotate-180"
              )}
            />
          </button>
          <AnimatePresence>
            {pkgDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-5 left-5 z-30 mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a] shadow-xl shadow-black/40"
                role="listbox"
              >
                {packages.map((pkg, idx) => {
                  const isActive = activePkgIdx === idx;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setActivePkgIdx(idx);
                        setPkgDropdownOpen(false);
                      }}
                      className={cn(
                        "flex min-h-11 min-w-11 w-full items-center justify-between px-4 py-3 text-left transition-colors",
                        isActive
                          ? "bg-accent/10 text-accent"
                          : "text-primary-foreground/70 hover:bg-white/[0.04] hover:text-primary-foreground"
                      )}
                    >
                      <span className="font-display text-sm font-medium">{pkg.name}</span>
                      <span
                        className={cn(
                          "font-sans text-xs font-semibold",
                          isActive ? "text-accent" : "text-primary-foreground/40"
                        )}
                      >
                        {formatPrice(pkg.basePrice)}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Comparison table */}
      <div className="compare-table overflow-x-auto rounded-2xl border border-white/[0.06] pb-2">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              {/* Feature column header */}
              <th
                scope="col"
                className="sticky top-0 z-20 w-2/5 border-b border-white/[0.08] bg-primary px-5 py-5 font-display text-xs font-semibold tracking-wider text-primary-foreground/40 uppercase md:px-6 md:py-6"
              >
                {t("feature")}
              </th>

              {/* Package column headers */}
              {packages.map((pkg, idx) => (
                <th
                  key={pkg.id}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 border-b border-white/[0.08] bg-primary px-4 py-5 text-center md:px-6 md:py-6",
                    idx !== activePkgIdx && "max-md:hidden"
                  )}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="font-display text-base font-bold text-primary-foreground md:text-lg">
                      {pkg.name}
                    </span>
                    <span className="font-sans text-sm font-semibold text-accent">
                      {formatPrice(pkg.basePrice)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Page limit row */}
            <tr className="feature-row border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
              <td className="px-5 py-4 font-sans text-sm text-primary-foreground/70 md:px-6">
                {t("pages_up_to", { limit: "" }).replace(/\s+$/, "")}
              </td>
              {packages.map((pkg, idx) => (
                <td
                  key={pkg.id}
                  className={cn(
                    "px-4 py-4 text-center font-sans text-sm font-medium text-primary-foreground md:px-6",
                    idx !== activePkgIdx && "max-md:hidden"
                  )}
                >
                  {pkg.pageLimit}
                </td>
              ))}
            </tr>

            {/* ISBN row */}
            <tr className="feature-row border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
              <td className="px-5 py-4 font-sans text-sm text-primary-foreground/70 md:px-6">
                ISBN
              </td>
              {packages.map((pkg, idx) => (
                <td
                  key={pkg.id}
                  className={cn(
                    "px-4 py-4 text-center md:px-6",
                    idx !== activePkgIdx && "max-md:hidden"
                  )}
                >
                  {pkg.includesISBN ? (
                    <Check className="mx-auto size-5 text-accent" aria-label={t("isbn_included")} />
                  ) : (
                    <Minus
                      className="mx-auto size-4 text-primary-foreground/20"
                      aria-label={t("isbn_not_included")}
                    />
                  )}
                </td>
              ))}
            </tr>

            {/* Copies per size rows */}
            {(["A4", "A5", "A6"] as const).map((size) => (
              <tr
                key={size}
                className="feature-row border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-5 py-4 font-sans text-sm text-primary-foreground/70 md:px-6">
                  {t("copies_count", { count: size })}
                </td>
                {packages.map((pkg, idx) => (
                  <td
                    key={pkg.id}
                    className={cn(
                      "px-4 py-4 text-center font-sans text-sm font-medium text-primary-foreground md:px-6",
                      idx !== activePkgIdx && "max-md:hidden"
                    )}
                  >
                    {pkg.features.copies[size]}
                  </td>
                ))}
              </tr>
            ))}

            {/* Divider */}
            <tr>
              <td
                colSpan={packages.length + 1}
                className="border-y border-white/[0.06] bg-secondary/30 px-5 py-3 font-display text-[11px] font-bold tracking-widest text-primary-foreground/40 uppercase md:px-6"
              >
                {t("whats_included")}
              </td>
            </tr>

            {/* Feature rows */}
            {allFeatures.map((featureName) => (
              <tr
                key={featureName}
                className="feature-row border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-5 py-4 font-sans text-sm text-primary-foreground/70 md:px-6">
                  {featureName}
                </td>
                {packages.map((pkg, idx) => {
                  const hasFeature = pkg.features.items.includes(featureName);
                  return (
                    <td
                      key={pkg.id}
                      className={cn(
                        "px-4 py-4 text-center md:px-6",
                        idx !== activePkgIdx && "max-md:hidden"
                      )}
                    >
                      {hasFeature ? (
                        <Check className="mx-auto size-5 text-accent" aria-hidden="true" />
                      ) : (
                        <Minus
                          className="mx-auto size-4 text-primary-foreground/20"
                          aria-hidden="true"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
