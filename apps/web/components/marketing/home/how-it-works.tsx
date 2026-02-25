"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Package, Palette, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const steps = [
  { key: "step1", icon: Upload, accent: "from-[#007eff]/18 via-[#007eff]/6 to-transparent" },
  { key: "step2", icon: Palette, accent: "from-white/20 via-white/8 to-transparent" },
  { key: "step3", icon: Package, accent: "from-[#007eff]/14 via-[#007eff]/5 to-transparent" },
] as const;

export function HowItWorks() {
  const t = useTranslations("home");
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 75%", "end 30%"],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-primary py-20 md:py-24 lg:py-32"
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(70% 44% at 8% 10%, rgba(0,126,255,0.16), transparent 70%), radial-gradient(58% 38% at 93% 88%, rgba(255,255,255,0.08), transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        {/* Header */}
        <motion.div
          className="mb-12 text-center md:mb-16 lg:mb-20"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2
            id="how-it-works-heading"
            className="font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl lg:text-5xl"
          >
            {t("how_title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-base text-primary-foreground/58 lg:text-lg">
            {t("how_subtitle")}
          </p>
        </motion.div>

        {/* Mobile timeline guide */}
        <div className="relative md:hidden" aria-hidden="true">
          <span className="absolute left-5 top-3.5 h-[calc(100%-3rem)] w-px bg-white/15" />
          <motion.span
            style={{ scaleY: lineScaleY }}
            className="absolute left-5 top-3.5 h-[calc(100%-3rem)] w-px origin-top bg-[#007eff]"
          />
        </div>

        {/* Steps */}
        <div className="relative grid gap-4 md:grid-cols-3 md:gap-5 lg:gap-8">
          {steps.map((step, i) => {
            const Icon = step.icon;

            return (
              <motion.article
                key={step.key}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 40, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "group relative overflow-hidden rounded-3xl border border-white/12 bg-black/55 p-6 pl-12 backdrop-blur-[2px] transition-all duration-300",
                  "hover:border-[#007eff]/45 hover:shadow-[0_22px_46px_rgba(0,126,255,0.15)]",
                  "md:p-7 md:pl-7 lg:p-8"
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                    step.accent
                  )}
                  aria-hidden="true"
                />

                {/* Mobile timeline pin */}
                <span
                  className="absolute left-[0.5rem] top-8 block h-3 w-3 rounded-full border border-[#007eff] bg-black md:hidden"
                  aria-hidden="true"
                />

                {/* Desktop connector */}
                {i < steps.length - 1 && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.2 + i * 0.1 }}
                    className="pointer-events-none absolute top-[2.85rem] right-[-1.85rem] hidden h-px w-[2rem] origin-left bg-white/25 md:block lg:right-[-2.25rem] lg:w-[2.6rem]"
                    aria-hidden="true"
                  />
                )}

                <div className="relative z-10 mb-5 flex items-center justify-between gap-4">
                  <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 px-3 font-display text-xs font-bold tracking-[0.18em] text-primary-foreground/80">
                    0{i + 1}
                  </span>

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#007eff]/35 bg-[#007eff]/12 text-[#76baff]">
                    <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                  </div>
                </div>

                <h3 className="relative z-10 mb-2 font-display text-xl font-semibold text-primary-foreground">
                  {t(`how_${step.key}_title`)}
                </h3>
                <p className="relative z-10 font-serif text-sm leading-relaxed text-primary-foreground/58 lg:text-base">
                  {t(`how_${step.key}_desc`)}
                </p>
              </motion.article>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          className="mt-10 text-center md:mt-12 lg:mt-16"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/pricing"
            className={cn(
              "group inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 shadow-[0_12px_28px_rgba(0,126,255,0.28)]",
              "font-display text-sm font-semibold tracking-wide text-accent-foreground",
              "transition-all duration-300 hover:bg-accent/90 hover:shadow-[0_16px_34px_rgba(0,126,255,0.35)]",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            )}
          >
            {t("how_cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
