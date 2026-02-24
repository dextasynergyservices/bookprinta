"use client";

import { useGSAP } from "@gsap/react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { usePackages } from "@/hooks/usePackages";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function PricingCards() {
  const t = useTranslations("pricing");
  const { data: tiers, isLoading, isError, refetch } = usePackages();
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!isLoading && !isError && tiers?.length) {
        gsap.from(".pricing-card-wrapper", {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 85%",
          },
        });
      }
    },
    { dependencies: [isLoading, isError, tiers], scope: containerRef }
  );

  if (isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-5 md:grid-cols-3 md:gap-5 lg:gap-8 lg:px-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[500px] animate-pulse rounded-2xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (isError || !tiers) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-primary-foreground">
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-5 md:grid-cols-3 md:gap-5 lg:gap-8 lg:px-8"
    >
      {tiers.map((tier) => (
        <div key={tier.id} className="pricing-card-wrapper flex">
          <motion.div
            whileHover={{ y: -6, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)" }}
            className={cn(
              "relative flex w-full flex-col rounded-2xl border p-8 transition-colors lg:p-10",
              tier.popular
                ? "border-accent/50 bg-accent/5 shadow-[0_0_30px_rgba(0,126,255,0.1)]"
                : "border-secondary bg-primary shadow-lg"
            )}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-1 font-display text-xs font-semibold tracking-wider text-accent-foreground uppercase shadow-[0_0_15px_rgba(0,126,255,0.5)]">
                {t("most_popular")}
              </div>
            )}

            <h3 className="font-display text-2xl font-bold text-primary-foreground">{tier.name}</h3>

            <div className="my-6">
              <p className="font-sans text-xs font-medium text-primary-foreground/50 uppercase tracking-wider">
                {t("starting_from")}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-sans text-4xl font-bold text-primary-foreground">
                  {formatPrice(tier.basePrice)}
                </span>
              </div>

              <p className="mt-2 font-serif text-sm text-primary-foreground/70">
                {tier.description}
              </p>

              <p className="mt-2 inline-flex items-center justify-center rounded-full bg-white/10 px-3 py-1 font-sans text-xs font-medium text-primary-foreground">
                {t("pages_up_to", { limit: tier.pageLimit })}
              </p>
            </div>

            <ul className="mb-8 flex flex-col gap-3 flex-grow">
              {tier.includesISBN && (
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="font-sans text-sm font-medium text-accent">
                    {t("isbn_included")}
                  </span>
                </li>
              )}
              {tier.features
                .filter((f) => f.included)
                .map((feature) => (
                  <li key={feature.name} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-foreground/80" />
                    <span className="font-sans text-sm text-primary-foreground/80">
                      {feature.originalText || feature.name}
                    </span>
                  </li>
                ))}
            </ul>

            <Link
              href={`/checkout?package=${tier.key}`}
              className={cn(
                "mt-auto flex h-11 w-full items-center justify-center rounded-full px-6 text-center font-display text-sm font-semibold tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-primary",
                tier.popular
                  ? "bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent"
                  : "border border-white/20 bg-transparent text-primary-foreground hover:bg-white/5 focus:ring-white"
              )}
            >
              {t("select_package")}
            </Link>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
