"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FeatureComparisonTable } from "@/components/marketing/pricing/FeatureComparisonTable";
import { PricingCards } from "@/components/marketing/pricing/PricingCards";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@/lib/i18n/navigation";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── Main View ──────────────────────────────────────────────────────────────

export function NewBookView() {
  const t = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [showComparison, setShowComparison] = useState(false);

  // ── GSAP fade-in on header + CTA sections ──
  useGSAP(
    () => {
      if (prefersReducedMotion) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 85%",
        },
      });

      tl.from(".nb-header-title", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      }).from(
        ".nb-header-subtitle",
        { y: 20, opacity: 0, duration: 0.6, ease: "power3.out" },
        "-=0.4"
      );

      gsap.from(".nb-cta-section", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".nb-cta-section",
          start: "top 90%",
        },
      });
    },
    { dependencies: [prefersReducedMotion], scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <div className="mb-10 px-5 md:mb-14">
        <h1 className="nb-header-title font-display text-2xl font-bold text-white md:text-3xl">
          {t("new_project_title")}
        </h1>
        <p className="nb-header-subtitle mt-2 max-w-lg font-sans text-sm leading-relaxed text-[#aaa]">
          {t("new_project_subtitle")}
        </p>
      </div>

      {/* Package categories + cards + ConfigurationModal — full standard flow */}
      <PricingCards
        checkoutBasePath="/dashboard/new-book/checkout"
        showQuoteCard
        quoteHref="/dashboard/new-book/quote"
      />

      {/* Compare Plans Button */}
      <div className="flex justify-center mt-6">
        <button
          type="button"
          className="rounded-full bg-accent px-8 py-3 font-display text-sm font-semibold tracking-wide text-accent-foreground shadow hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary"
          onClick={() => setShowComparison(true)}
        >
          {t("compare_plans", { defaultValue: "Compare Plans" })}
        </button>
      </div>

      {/* Feature Comparison Modal */}
      {showComparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative w-full max-w-4xl mx-4 bg-primary rounded-2xl shadow-2xl p-0 md:p-6 overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              className="absolute top-4 right-4 z-10 rounded-full bg-accent/10 p-2 text-accent hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Close"
              onClick={() => setShowComparison(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
            <FeatureComparisonTable />
          </div>
        </div>
      )}

      {/* Custom quote CTA */}
      <div className="nb-cta-section mt-14 flex flex-col items-center gap-4 border-t border-[#2A2A2A] px-5 pt-12 text-center">
        <p className="max-w-md font-sans text-sm leading-relaxed text-primary-foreground/50">
          {t("new_project_quote_hint")}
        </p>
        <Link
          href="/dashboard/new-book/quote"
          className="group inline-flex min-h-12 items-center gap-2 rounded-full border border-accent/40 px-8 font-display text-sm font-semibold tracking-wide text-accent transition-all duration-300 hover:border-accent/60 hover:bg-accent/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          {t("new_project_get_quote")}
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}
