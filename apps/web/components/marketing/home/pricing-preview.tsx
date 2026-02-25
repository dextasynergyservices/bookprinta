"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { PricingCards } from "@/components/marketing/pricing/PricingCards";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

export function PricingPreview() {
  const t = useTranslations("home");

  return (
    <section className="relative overflow-hidden bg-primary py-20 lg:py-32" id="pricing-preview">
      {/* Grid pattern background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        {/* Header */}
        <motion.div
          className="mb-14 text-center lg:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl lg:text-5xl">
            {t("pricing_title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-base text-primary-foreground/60 lg:text-lg">
            {t("pricing_subtitle")}
          </p>
        </motion.div>

        {/* Cards */}
        <div className="-mx-5 lg:-mx-8">
          <PricingCards />
        </div>

        {/* CTA */}
        <motion.div
          className="mt-12 text-center lg:mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <Link
            href="/pricing"
            className={cn(
              "group inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-3.5",
              "font-display text-sm font-semibold tracking-wide text-primary-foreground",
              "transition-all duration-300 hover:border-accent/50 hover:bg-accent/10",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            )}
          >
            {t("pricing_cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
