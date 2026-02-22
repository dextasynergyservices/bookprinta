"use client";

import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, Package, Palette, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const steps = [
  { key: "step1", icon: Upload },
  { key: "step2", icon: Palette },
  { key: "step3", icon: Package },
] as const;

export function HowItWorks() {
  const t = useTranslations("home");
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const cards = cardsRef.current.filter(Boolean);
    if (!cards.length) return;

    const ctx = gsap.context(() => {
      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            delay: i * 0.15,
            ease: "power3.out",
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
              once: true,
            },
          }
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-background py-20 lg:py-32"
      id="how-it-works"
    >
      {/* Subtle dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
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
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            {t("how_title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-base text-muted-foreground lg:text-lg">
            {t("how_subtitle")}
          </p>
        </motion.div>

        {/* Steps grid */}
        <div className="grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.key}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className={cn(
                  "group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300",
                  "hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5",
                  "lg:p-10"
                )}
              >
                {/* Step number */}
                <div className="step-number mb-6 font-display">{i + 1}</div>

                {/* Icon */}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors duration-300 group-hover:bg-accent/20">
                  <Icon className="size-6" strokeWidth={1.5} />
                </div>

                {/* Text */}
                <h3 className="mb-2 font-display text-xl font-semibold text-foreground">
                  {t(`how_${step.key}_title`)}
                </h3>
                <p className="font-serif text-sm leading-relaxed text-muted-foreground lg:text-base">
                  {t(`how_${step.key}_desc`)}
                </p>

                {/* Connector line (desktop only, not on last) */}
                {i < steps.length - 1 && (
                  <div
                    className="pointer-events-none absolute right-0 top-1/2 hidden h-px w-10 -translate-y-1/2 translate-x-full bg-border md:block lg:w-10"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          className="mt-12 text-center lg:mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/pricing"
            className={cn(
              "group inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5",
              "font-display text-sm font-semibold tracking-wide text-accent-foreground",
              "transition-all duration-300 hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/20",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
