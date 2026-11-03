"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function PricingHero() {
  const t = useTranslations("pricing");
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useGSAP(
    () => {
      if (prefersReducedMotion) return;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(".pricing-hero-title", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
      }).from(
        ".pricing-hero-subtitle",
        {
          y: 30,
          opacity: 0,
          duration: 0.7,
        },
        "-=0.4"
      );

      gsap.fromTo(
        ".pricing-hero-divider-progress",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        }
      );
    },
    { dependencies: [prefersReducedMotion], scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden bg-primary"
      aria-labelledby="pricing-hero-heading"
    >
      {/* Subtle radial gradient accent */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,126,255,0.08), transparent)",
        }}
      />

      {/* Kept short so the packages, the reason people open this page, are in
          the first screen. On desktop the subtitle sits beside the heading. */}
      <div className="relative mx-auto w-full max-w-7xl px-5 pt-24 pb-8 md:px-8 md:pt-32 md:pb-10 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end lg:gap-12 lg:pt-32 lg:pb-12">
        <h1
          id="pricing-hero-heading"
          className="max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-primary-foreground md:text-5xl lg:text-6xl"
        >
          <span className="pricing-hero-title block">{t("hero_title_line1")}</span>
          <span className="pricing-hero-title block">{t("hero_title_line2")}</span>
          <span className="pricing-hero-title block text-accent">{t("hero_title_line3")}</span>
        </h1>

        <p className="pricing-hero-subtitle mt-5 max-w-xl font-serif text-lg leading-relaxed text-primary-foreground/50 md:mt-6 md:text-xl lg:mt-0 lg:pb-2">
          {t("hero_subtitle")}
        </p>
      </div>

      <div
        className="pricing-hero-divider-progress pointer-events-none absolute right-0 bottom-0 left-0 h-px origin-left bg-gradient-to-r from-white/0 via-white/20 to-white/0"
        aria-hidden="true"
      />
    </section>
  );
}
