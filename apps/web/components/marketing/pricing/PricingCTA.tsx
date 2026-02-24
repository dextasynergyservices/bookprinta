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
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".pricing-cta-content", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="relative overflow-hidden bg-accent py-24 px-5">
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 120%, white 0%, transparent 60%)",
        }}
      />
      <div className="pricing-cta-content relative z-10 mx-auto w-full max-w-4xl text-center">
        <h2 className="font-display text-4xl font-bold text-accent-foreground md:text-5xl lg:text-6xl">
          {t("cta_title")}
        </h2>
        <div className="mt-12 flex justify-center">
          <Link
            href="/contact?subject=quote"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary px-10 py-5 font-display text-sm font-bold tracking-wide text-primary-foreground focus:outline-none focus:ring-4 focus:ring-primary/20"
          >
            <span className="relative z-10">{t("cta_button")}</span>
            <div className="absolute inset-0 z-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        </div>
      </div>
    </section>
  );
}
