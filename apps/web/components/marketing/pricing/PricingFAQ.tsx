"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { FaqAccordionItem, FaqCategoryHeading } from "@/components/marketing/faq/FaqAccordionItem";
import { Accordion } from "@/components/ui/accordion";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// Pricing-related FAQ items — subset of the full FAQ page
const PRICING_FAQS = [
  {
    qKey: "q1",
    aKey: "a1",
    relatedLinks: [{ labelKey: "link_showcase", href: "/showcase" }],
  },
  {
    qKey: "q4",
    aKey: "a4",
    relatedLinks: [{ labelKey: "link_pricing", href: "/pricing" }],
  },
  {
    qKey: "q6",
    aKey: "a6",
    relatedLinks: [{ labelKey: "link_pricing", href: "/pricing" }],
  },
  {
    qKey: "q8",
    aKey: "a8",
    relatedLinks: [{ labelKey: "link_contact", href: "/contact" }],
  },
];

export function PricingFAQ({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const t = useTranslations("faq");
  const isLight = variant === "light";

  return (
    <div className="mx-auto max-w-3xl px-5 md:px-10 lg:px-14">
      <Accordion type="single" collapsible className="w-full">
        <FaqCategoryHeading variant={variant}>{t("category_pricing")}</FaqCategoryHeading>

        {PRICING_FAQS.map((faq, i) => (
          <FaqAccordionItem
            key={faq.qKey}
            value={faq.qKey}
            question={t(faq.qKey)}
            answer={t(faq.aKey)}
            index={i}
            displayNumber={i + 1}
            relatedLinks={faq.relatedLinks}
            variant={variant}
          />
        ))}
      </Accordion>

      {/* Link to full FAQ page */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-10 text-center"
      >
        <Link
          href="/faq"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-6 py-3 font-display text-sm font-semibold transition-all duration-200 hover:border-accent/50 hover:text-accent",
            isLight ? "border-primary text-primary" : "border-white/10 text-primary-foreground/60"
          )}
        >
          {t("see_all_faqs")}
          <span aria-hidden="true">→</span>
        </Link>
      </motion.div>
    </div>
  );
}
