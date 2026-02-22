"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/* Use the first 4 FAQ items from the faq namespace (already defined in en.json/fr.json) */
const faqKeys = ["1", "2", "3", "4"] as const;

const itemVariants = {
  hidden: (i: number) => ({
    opacity: 0,
    x: i % 2 === 0 ? -30 : 30,
  }),
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function FaqPreview() {
  const tHome = useTranslations("home");
  const tFaq = useTranslations("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="relative overflow-hidden bg-background py-20 lg:py-32" id="faq-preview">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        {/* Header */}
        <motion.div
          className="mb-14 text-center lg:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            {tHome("faq_title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-base text-muted-foreground lg:text-lg">
            {tHome("faq_subtitle")}
          </p>
        </motion.div>

        {/* Accordion items */}
        <div className="space-y-0">
          {faqKeys.map((key, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                key={key}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                className="faq-accordion-item"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 py-5 text-left transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded-sm"
                  )}
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-medium text-foreground pr-4 lg:text-lg">
                    {tFaq(`q${key}`)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-5 flex-shrink-0 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 font-serif text-sm leading-relaxed text-muted-foreground lg:text-base">
                        {tFaq(`a${key}`)}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          className="mt-12 text-center lg:mt-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Link
            href="/faq"
            className={cn(
              "group inline-flex items-center gap-2",
              "font-display text-sm font-semibold tracking-wide text-foreground",
              "transition-colors duration-300 hover:text-accent"
            )}
          >
            {tHome("faq_cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
