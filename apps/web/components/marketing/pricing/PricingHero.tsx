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
      })
        .from(
          ".pricing-hero-subtitle",
          {
            y: 30,
            opacity: 0,
            duration: 0.7,
          },
          "-=0.4"
        )
        .from(
          ".pricing-hero-line",
          {
            scaleX: 0,
            duration: 0.6,
          },
          "-=0.3"
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

      <div className="relative mx-auto w-full max-w-7xl px-5 pt-28 pb-12 md:px-8 md:pt-36 md:pb-16 lg:pt-44 lg:pb-20">
        <h1
          id="pricing-hero-heading"
          className="max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-primary-foreground md:text-6xl lg:text-7xl"
        >
          <span className="pricing-hero-title block">{t("hero_title")}</span>
          <span className="pricing-hero-title block text-accent">{t("hero_title_em")}</span>
        </h1>

        <p className="pricing-hero-subtitle mt-6 max-w-xl font-serif text-lg leading-relaxed text-primary-foreground/50 md:mt-8 md:text-xl">
          {t("hero_subtitle")}
        </p>

        <div
          className="pricing-hero-line mt-10 h-px w-full max-w-xs origin-left bg-white/10 md:mt-14"
          aria-hidden="true"
        />
      </div>

      <div
        className="pointer-events-none absolute right-0 bottom-0 left-0 h-px bg-gradient-to-r from-white/0 via-white/15 to-white/0"
        aria-hidden="true"
      />
      <div
        className="pricing-hero-divider-progress pointer-events-none absolute right-0 bottom-0 left-0 h-px origin-left bg-gradient-to-r from-white/0 via-white/20 to-white/0"
        aria-hidden="true"
      />
    </section>
  );
}
