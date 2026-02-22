"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "@/lib/i18n/navigation";

// ═════════════════════════════════════════════════════════════════════════════
// FAQ ACCORDION ITEM — numbered, with feedback + optional related links
// ═════════════════════════════════════════════════════════════════════════════

interface RelatedLink {
  labelKey: string;
  href: string;
}

interface FaqAccordionItemProps {
  value: string;
  question: string;
  answer: string;
  /** 0-based index used for stagger delay + display number */
  index: number;
  /** Optional display number override (1-based) */
  displayNumber: number;
  /** Optional related links shown below the answer */
  relatedLinks?: RelatedLink[];
}

const answerVariants = {
  collapsed: { opacity: 0, filter: "blur(4px)", y: 8 },
  expanded: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.05,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function FaqAccordionItem({
  value,
  question,
  answer,
  index,
  displayNumber,
  relatedLinks,
}: FaqAccordionItemProps) {
  const t = useTranslations("faq");
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);

  // Format number as 2-digit: 1 → "01"
  const num = String(displayNumber).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.6,
        delay: index * 0.07,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <AccordionItem value={value} className="group/item border-b border-white/10 last:border-b-0">
        <AccordionTrigger className="gap-4 py-5 font-display text-base font-bold tracking-tight text-white transition-colors duration-300 hover:text-accent hover:no-underline md:py-7 md:text-lg [&>svg]:text-white/30 [&>svg]:transition-colors [&>svg]:duration-300 [&[data-state=open]>svg]:text-accent">
          <span className="flex items-baseline gap-3 transition-transform duration-300 group-hover/item:translate-x-1">
            {/* #4 — Numbered prefix */}
            <span className="font-sans text-xs font-medium text-accent/50">{num}</span>
            <span>{question}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-6 md:pb-8">
          {/* Answer with blur-to-clear reveal */}
          <motion.div initial="collapsed" animate="expanded" variants={answerVariants}>
            <p className="max-w-2xl pl-8 font-serif text-sm leading-relaxed text-white/45 md:text-base">
              {answer}
            </p>

            {/* #8 — Related links */}
            {relatedLinks && relatedLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3 pl-8">
                {relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/20 px-3 py-1 font-sans text-xs text-accent transition-colors duration-200 hover:border-accent hover:bg-accent/10"
                  >
                    {t(link.labelKey)}
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}

            {/* #7 — "Was this helpful?" feedback */}
            <div className="mt-5 pl-8">
              {feedback === null ? (
                <div className="flex items-center gap-3">
                  <span className="font-sans text-xs text-white/25">{t("helpful_question")}</span>
                  <button
                    type="button"
                    onClick={() => setFeedback("yes")}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 font-sans text-xs text-white/40 transition-all duration-200 hover:border-green-500/50 hover:text-green-400"
                    aria-label={t("helpful_yes")}
                  >
                    <ThumbsUpIcon className="size-3" />
                    {t("helpful_yes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedback("no")}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 font-sans text-xs text-white/40 transition-all duration-200 hover:border-red-500/50 hover:text-red-400"
                    aria-label={t("helpful_no")}
                  >
                    <ThumbsDownIcon className="size-3" />
                    {t("helpful_no")}
                  </button>
                </div>
              ) : (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="font-sans text-xs text-accent/60"
                >
                  {t("helpful_thanks")}
                </motion.span>
              )}
            </div>
          </motion.div>
        </AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DIVIDER IMAGE — scale + parallax reveal
// ═════════════════════════════════════════════════════════════════════════════

export function FaqDividerImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);
  const imageScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.15, 1.05, 1.15]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 1.04 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-48 w-full overflow-hidden sm:h-56 md:h-72 lg:h-88"
    >
      <motion.div
        style={{ y: imageY, scale: imageScale }}
        className="absolute inset-[-15%] will-change-transform"
      >
        <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" loading="lazy" />
      </motion.div>
      <div className="absolute inset-0 bg-linear-to-b from-primary/30 via-transparent to-primary/30" />
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY HEADING — border-draw animation (scaleY 0→1)
// ═════════════════════════════════════════════════════════════════════════════

export function FaqCategoryHeading({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-30px" }}
      className="relative mb-8 pl-4 md:mb-10"
    >
      <motion.div
        variants={{
          hidden: { scaleY: 0 },
          visible: {
            scaleY: 1,
            transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
          },
        }}
        className="absolute top-0 left-0 h-full w-[3px] origin-top bg-accent"
      />
      <motion.h2
        variants={{
          hidden: { opacity: 0, x: -12 },
          visible: {
            opacity: 1,
            x: 0,
            transition: { duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] },
          },
        }}
        className="font-display text-xs font-semibold uppercase tracking-widest text-white/30 md:text-sm"
      >
        {children}
      </motion.h2>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION CROSSFADE — smooth gradient between sections
// ═════════════════════════════════════════════════════════════════════════════

const crossfadeColors = {
  primary: "rgb(0,0,0)",
  dark: "rgb(10,10,10)",
  accent: "rgb(0,126,255)",
} as const;

type CrossfadeVariant = keyof typeof crossfadeColors;

export function SectionCrossfade({ from, to }: { from: CrossfadeVariant; to: CrossfadeVariant }) {
  return (
    <div
      className="h-16 w-full md:h-24"
      style={{
        background: `linear-gradient(to bottom, ${crossfadeColors[from]}, ${crossfadeColors[to]})`,
      }}
      aria-hidden="true"
    />
  );
}
