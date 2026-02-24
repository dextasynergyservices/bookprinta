"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

const faqs = [
  { q: "q1", a: "a1" },
  { q: "q4", a: "a4" },
  { q: "q6", a: "a6" },
  { q: "q8", a: "a8" },
];

export function PricingFAQ() {
  const t = useTranslations("faq");
  // biome-ignore lint/suspicious/noExplicitAny: string union state
  const [openIndex, setOpenIndex] = useState<any>(faqs[0].q);

  return (
    <div className="mx-auto max-w-3xl px-5">
      <div className="divide-y divide-secondary border-y border-secondary">
        {faqs.map((faq) => {
          const isOpen = openIndex === faq.q;

          return (
            <div key={faq.q} className="group">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : (faq.q as any))}
                className="flex w-full items-center justify-between py-6 text-left focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary rounded-sm"
              >
                <span className="font-display text-lg font-bold text-primary-foreground transition-colors group-hover:text-accent">
                  {/* biome-ignore lint/suspicious/noExplicitAny: Intentional cast for next-intl keys */}
                  {t(faq.q as any)}
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-primary-foreground/50 transition-transform duration-300",
                    isOpen && "rotate-180 text-accent"
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 font-serif text-primary-foreground/70 leading-relaxed min-h-[44px]">
                      {/* biome-ignore lint/suspicious/noExplicitAny: Intentional cast for next-intl keys */}
                      {t(faq.a as any)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
