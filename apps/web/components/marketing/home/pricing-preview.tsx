"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const tiers = [
  {
    key: "first_draft",
    features: ["f1", "f2", "f3"],
    popular: false,
  },
  {
    key: "glow_up",
    features: ["f1", "f2", "f3"],
    popular: true,
  },
  {
    key: "legacy",
    features: ["f1", "f2", "f3"],
    popular: false,
  },
] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      delay: i * 0.15,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

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
        <div className="grid gap-6 md:grid-cols-3 md:gap-5 lg:gap-8">
          {tiers.map((tier, i) => (
            <div key={tier.key} className="relative">
              {/* Popular badge — sits above the card, outside overflow */}
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-1 font-display text-xs font-semibold tracking-wider text-accent-foreground uppercase">
                  {t("pricing_glow_up_badge")}
                </div>
              )}

              <motion.div
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                className={cn(
                  "pricing-card-glow group rounded-2xl border p-8 transition-all duration-300 lg:p-10",
                  tier.popular
                    ? "border-accent/40 bg-accent/5 shadow-lg shadow-accent/10"
                    : "border-white/10 bg-white/5"
                )}
              >
                {/* Tier name */}
                <h3 className="font-display text-xl font-bold text-primary-foreground lg:text-2xl">
                  {t(`pricing_${tier.key}`)}
                </h3>

                {/* Description */}
                <p className="mt-2 font-serif text-sm text-primary-foreground/50 lg:text-base">
                  {t(`pricing_${tier.key}_desc`)}
                </p>

                {/* Price */}
                <div className="mt-6 mb-6">
                  <span className="font-display text-2xl font-bold text-accent lg:text-3xl">
                    {t(`pricing_${tier.key}_price`)}
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 flex-shrink-0 text-accent" />
                      <span className="text-sm text-primary-foreground/70">
                        {t(`pricing_${tier.key}_${f}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          ))}
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
