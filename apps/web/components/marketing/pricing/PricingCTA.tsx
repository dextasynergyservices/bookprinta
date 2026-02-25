"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Link } from "@/lib/i18n/navigation";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function PricingCTA() {
  const t = useTranslations("pricing");
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
      });

      tl.from(".pricing-cta-title", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      })
        .from(
          ".pricing-cta-sub",
          {
            y: 20,
            opacity: 0,
            duration: 0.6,
            ease: "power3.out",
          },
          "-=0.4"
        )
        .from(
          ".pricing-cta-btn",
          {
            y: 20,
            opacity: 0,
            duration: 0.6,
            ease: "power3.out",
          },
          "-=0.3"
        );
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="relative flex overflow-hidden bg-accent px-5 py-14 md:flex-row md:items-center md:justify-between md:px-10 md:py-20 lg:px-14"
      aria-labelledby="pricing-cta-heading"
    >
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 120%, white 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="max-w-3xl">
          <h2
            id="pricing-cta-heading"
            className="pricing-cta-title font-display text-2xl font-bold text-accent-foreground md:text-4xl lg:text-5xl"
          >
            {t("cta_title")}
          </h2>

          <p className="pricing-cta-sub mt-5 max-w-lg font-serif text-base leading-relaxed text-accent-foreground/70 md:mt-1 md:text-lg">
            {t("cta_subtitle")}
          </p>
        </div>

        <div className="pricing-cta-btn flex justify-start md:shrink-0 md:justify-end">
          <Link
            href="/contact?subject=quote"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary px-10 py-4 font-display text-sm font-bold tracking-wide text-primary-foreground transition-shadow duration-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/20 md:px-12 md:py-5"
          >
            <span className="relative z-10">{t("cta_button")}</span>
            <div
              className="absolute inset-0 z-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
