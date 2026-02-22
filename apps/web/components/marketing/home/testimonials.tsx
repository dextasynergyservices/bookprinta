"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const testimonials = [
  { key: "1", stars: 5 },
  { key: "2", stars: 5 },
  { key: "3", stars: 5 },
] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay: i * 0.15,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export function Testimonials() {
  const t = useTranslations("home");

  return (
    <section className="relative overflow-hidden bg-secondary py-20 lg:py-32" id="testimonials">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-accent/8 blur-[120px]"
        aria-hidden="true"
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
            {t("testimonials_title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-base text-muted-foreground lg:text-lg">
            {t("testimonials_subtitle")}
          </p>
        </motion.div>

        {/* Cards — horizontal scroll on mobile, 3-col grid on desktop */}
        <div className="relative -mx-5 px-5 lg:mx-0 lg:px-0">
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-none md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 lg:gap-8">
            {testimonials.map((item, i) => (
              <motion.div
                key={item.key}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                className={cn(
                  "testimonial-card flex-shrink-0 w-[300px] md:w-auto",
                  "rounded-2xl border border-border bg-card p-8 lg:p-10",
                  "transition-all duration-300 hover:shadow-lg hover:shadow-accent/5"
                )}
              >
                {/* Stars */}
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: item.stars }).map((_, s) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static decorative stars never reorder
                    <Star key={`star-${s}`} className="size-4 fill-accent text-accent" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="mb-6 font-serif text-sm leading-relaxed text-foreground/80 lg:text-base">
                  &ldquo;{t(`testimonial_${item.key}_quote`)}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="mt-auto">
                  <div className="flex items-center gap-3">
                    {/* Avatar placeholder */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-display text-sm font-bold text-accent">
                      {t(`testimonial_${item.key}_author`)
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="font-display text-sm font-semibold text-foreground">
                        {t(`testimonial_${item.key}_author`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`testimonial_${item.key}_role`)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
