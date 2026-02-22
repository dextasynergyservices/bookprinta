"use client";

import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { ArrowRightIcon, BookOpenIcon, PackageIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaqAccordionItem,
  FaqCategoryHeading,
  FaqDividerImage,
  SectionCrossfade,
} from "@/components/marketing/faq/FaqAccordionItem";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { Accordion } from "@/components/ui/accordion";
import { useLenis } from "@/hooks/use-lenis";
import { Link } from "@/lib/i18n/navigation";

// ── Staggered clip-path line reveal ─────────────────────────────────────────
const HERO_LINES = [
  { text: "Q", accent: false },
  { text: "&", accent: true },
  { text: "A", accent: false },
] as const;

const lineRevealVariants = {
  hidden: { clipPath: "inset(100% 0 0 0)", y: 20 },
  visible: (i: number) => ({
    clipPath: "inset(0% 0 0 0)",
    y: 0,
    transition: {
      duration: 0.8,
      delay: 0.15 + i * 0.15,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

// ── Animated counter hook ───────────────────────────────────────────────────
function useCounter(target: number, duration = 1.5) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const controls = animate(motionVal, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });

    return () => controls.stop();
  }, [isInView, motionVal, target, duration]);

  return { ref, display };
}

// ── FAQ data with related links ─────────────────────────────────────────────

interface RelatedLink {
  labelKey: string;
  href: string;
}

interface FaqItem {
  qKey: string;
  aKey: string;
  relatedLinks?: RelatedLink[];
}

const FAQ_GROUPS: {
  categoryKey: string;
  sectionId: string;
  items: FaqItem[];
}[] = [
  {
    categoryKey: "category_getting_started",
    sectionId: "getting-started",
    items: [
      {
        qKey: "q1",
        aKey: "a1",
        relatedLinks: [{ labelKey: "link_showcase", href: "/showcase" }],
      },
      { qKey: "q2", aKey: "a2" },
      { qKey: "q3", aKey: "a3" },
      {
        qKey: "q4",
        aKey: "a4",
        relatedLinks: [{ labelKey: "link_pricing", href: "/pricing" }],
      },
      {
        qKey: "q5",
        aKey: "a5",
        relatedLinks: [{ labelKey: "link_pricing", href: "/pricing" }],
      },
    ],
  },
  {
    categoryKey: "category_pricing",
    sectionId: "pricing",
    items: [
      {
        qKey: "q6",
        aKey: "a6",
        relatedLinks: [{ labelKey: "link_pricing", href: "/pricing" }],
      },
      { qKey: "q7", aKey: "a7" },
      {
        qKey: "q8",
        aKey: "a8",
        relatedLinks: [{ labelKey: "link_contact", href: "/contact" }],
      },
    ],
  },
  {
    categoryKey: "category_printing",
    sectionId: "printing",
    items: [
      { qKey: "q9", aKey: "a9" },
      { qKey: "q10", aKey: "a10" },
      { qKey: "q11", aKey: "a11" },
      { qKey: "q12", aKey: "a12" },
      {
        qKey: "q13",
        aKey: "a13",
        relatedLinks: [{ labelKey: "link_contact", href: "/contact" }],
      },
    ],
  },
];

// Anchor pill data for quick navigation
const ANCHOR_PILLS = FAQ_GROUPS.map((g) => ({
  label: g.categoryKey,
  target: `#${g.sectionId}`,
}));

const TOTAL_QUESTIONS = 13;

export function FaqView() {
  const t = useTranslations("faq");
  const { lenis } = useLenis();
  const heroRef = useRef<HTMLDivElement>(null);

  // ── Scroll-triggered counter ──
  const counter = useCounter(TOTAL_QUESTIONS);

  // ── Scroll-linked parallax values ──
  const scrollY = useMotionValue(0);

  useEffect(() => {
    if (!lenis) return;

    const unsubscribe = lenis.on("scroll", ({ scroll }: { scroll: number }) => {
      scrollY.set(scroll);
    });

    return () => unsubscribe();
  }, [lenis, scrollY]);

  // Hero image parallax
  const heroImageY = useTransform(scrollY, [0, 700], [0, 100]);
  const heroTextOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroTextY = useTransform(scrollY, [0, 400], [0, -30]);

  // ── #1 — Smooth scroll to section via Lenis ──
  const scrollToSection = useCallback(
    (target: string) => {
      if (!lenis) return;
      const el = document.querySelector(target) as HTMLElement | null;
      if (el) lenis.scrollTo(el, { offset: -80, duration: 1.2 });
    },
    [lenis]
  );

  // Running question counter for display numbers
  let questionNumber = 0;

  return (
    <>
      {/* ── Scroll Progress Bar ── */}
      <ScrollProgress />

      <div className="min-h-screen bg-primary">
        {/* ════════════════════════════════════════════════════════════
				    HERO — Split layout with staggered reveal + anchor pills
				    ════════════════════════════════════════════════════════════ */}
        <section
          ref={heroRef}
          className="relative min-h-[60svh] overflow-hidden bg-primary md:min-h-[90svh]"
        >
          {/* Decorative oversized ? */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-display text-[16rem] font-bold leading-none text-accent/8 md:text-[28rem] lg:text-[36rem]"
            aria-hidden="true"
          >
            ?
          </motion.div>

          <div className="relative mx-auto flex min-h-[55svh] max-w-7xl flex-col items-center justify-center px-5 text-center sm:min-h-[60svh] md:min-h-[90svh] md:flex-row md:items-end md:justify-start md:text-left md:px-10 lg:px-14">
            {/* ── Text column ── */}
            <motion.div
              style={{ opacity: heroTextOpacity, y: heroTextY }}
              className="relative z-20 flex flex-1 flex-col items-center justify-center py-10 md:items-start md:justify-end md:max-w-[55%] md:pt-24 md:pb-20 lg:pt-28 lg:pb-28"
            >
              {/* Staggered line reveal */}
              <h1 className="font-display text-6xl font-bold leading-[1.02] tracking-tight text-primary-foreground md:text-7xl lg:text-[5.5rem]">
                {HERO_LINES.map((line, i) => (
                  <span key={line.text} className="inline overflow-hidden">
                    <motion.span
                      custom={i}
                      initial="hidden"
                      animate="visible"
                      variants={lineRevealVariants}
                      className={`inline ${line.accent ? "text-accent" : ""}`}
                    >
                      {line.text}
                    </motion.span>
                  </span>
                ))}
              </h1>

              {/* Subtitle + counter */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mt-5 flex flex-col gap-4 md:mt-8"
              >
                <p className="max-w-md border-l-[3px] border-accent pl-4 text-left font-serif text-base leading-relaxed text-primary-foreground/45 md:text-lg lg:text-xl">
                  {t("hero_subtitle")}
                </p>

                {/* Animated counter */}
                <p className="font-sans text-sm uppercase tracking-widest text-primary-foreground/25 md:text-base">
                  <span ref={counter.ref} className="tabular-nums text-accent">
                    {counter.display}
                  </span>{" "}
                  answers below
                </p>
              </motion.div>

              {/* #1 — Anchor pills for smooth scroll */}
              <motion.nav
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 flex flex-wrap items-center justify-center gap-2 md:mt-8 md:justify-start"
                aria-label={t("jump_to")}
              >
                <span className="mr-1 font-sans text-sm uppercase tracking-widest text-primary-foreground/20">
                  {t("jump_to")}
                </span>
                {ANCHOR_PILLS.map((pill) => (
                  <button
                    key={pill.target}
                    type="button"
                    onClick={() => scrollToSection(pill.target)}
                    className="rounded-full border border-white/10 px-4 py-2 font-sans text-sm text-white/40 transition-all duration-200 hover:border-accent/50 hover:text-accent"
                  >
                    {t(pill.label)}
                  </button>
                ))}
              </motion.nav>
            </motion.div>

            {/* ── Image column — Ken Burns continuous zoom ── */}
            <motion.div
              initial={{ clipPath: "inset(100% 0 0 0)" }}
              animate={{ clipPath: "inset(0% 0 0 0)" }}
              transition={{ duration: 1.2, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: heroImageY }}
              className="absolute inset-y-0 right-0 z-10 w-full md:w-[50%] lg:w-[45%]"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{
                  duration: 20,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }}
                className="absolute inset-0"
              >
                <Image
                  src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1200&q=80"
                  alt={t("hero_image_alt")}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              </motion.div>
              <div className="absolute inset-0 bg-linear-to-r from-primary via-primary/80 to-transparent" />
              <div className="absolute inset-0 bg-linear-to-t from-primary via-transparent to-primary/50 md:from-primary/60" />
            </motion.div>
          </div>

          {/* Angled cut at bottom */}
          <div
            className="absolute inset-x-0 bottom-0 z-20 h-16 bg-primary md:h-24"
            style={{ clipPath: "polygon(0 100%, 100% 40%, 100% 100%)" }}
          />
        </section>

        {/* ════════════════════════════════════════════════════════════
				    SECTION 1 — Getting Started
				    ════════════════════════════════════════════════════════════ */}
        <section id="getting-started" className="scroll-mt-20 bg-primary">
          <div className="mx-auto max-w-3xl px-5 pt-16 pb-8 md:px-10 md:pt-24 md:pb-12 lg:px-14">
            <Accordion type="single" collapsible className="w-full">
              <FaqCategoryHeading>{t(FAQ_GROUPS[0].categoryKey)}</FaqCategoryHeading>

              {FAQ_GROUPS[0].items.map((item, i) => {
                questionNumber++;
                return (
                  <FaqAccordionItem
                    key={item.qKey}
                    value={item.qKey}
                    question={t(item.qKey)}
                    answer={t(item.aKey)}
                    index={i}
                    displayNumber={questionNumber}
                    relatedLinks={item.relatedLinks}
                  />
                );
              })}
            </Accordion>
          </div>
        </section>

        <SectionCrossfade from="primary" to="dark" />

        {/* ── Divider image 1 ── */}
        <FaqDividerImage
          src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1920&q=80"
          alt={t("divider_alt_1")}
        />

        <SectionCrossfade from="dark" to="primary" />

        {/* ════════════════════════════════════════════════════════════
				    SECTION 2 — Pricing & Payments
				    ════════════════════════════════════════════════════════════ */}
        <section id="pricing" className="scroll-mt-20 bg-[#0a0a0a]">
          <div className="mx-auto max-w-3xl px-5 py-16 md:px-10 md:py-24 lg:px-14">
            <Accordion type="single" collapsible className="w-full">
              <FaqCategoryHeading>{t(FAQ_GROUPS[1].categoryKey)}</FaqCategoryHeading>

              {FAQ_GROUPS[1].items.map((item, i) => {
                questionNumber++;
                return (
                  <FaqAccordionItem
                    key={item.qKey}
                    value={item.qKey}
                    question={t(item.qKey)}
                    answer={t(item.aKey)}
                    index={i}
                    displayNumber={questionNumber}
                    relatedLinks={item.relatedLinks}
                  />
                );
              })}
            </Accordion>
          </div>
        </section>

        <SectionCrossfade from="primary" to="dark" />

        {/* ── Divider image 2 ── */}
        <FaqDividerImage
          src="https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=1920&q=80"
          alt={t("divider_alt_2")}
        />

        <SectionCrossfade from="dark" to="primary" />

        {/* ════════════════════════════════════════════════════════════
				    SECTION 3 — Printing & Delivery
				    ════════════════════════════════════════════════════════════ */}
        <section id="printing" className="scroll-mt-20 bg-primary">
          <div className="mx-auto max-w-3xl px-5 py-16 md:px-10 md:py-24 lg:px-14">
            <Accordion type="single" collapsible className="w-full">
              <FaqCategoryHeading>{t(FAQ_GROUPS[2].categoryKey)}</FaqCategoryHeading>

              {FAQ_GROUPS[2].items.map((item, i) => {
                questionNumber++;
                return (
                  <FaqAccordionItem
                    key={item.qKey}
                    value={item.qKey}
                    question={t(item.qKey)}
                    answer={t(item.aKey)}
                    index={i}
                    displayNumber={questionNumber}
                    relatedLinks={item.relatedLinks}
                  />
                );
              })}
            </Accordion>
          </div>
        </section>

        {/* ── #5 — Third divider image before CTA ── */}
        <SectionCrossfade from="primary" to="dark" />

        <FaqDividerImage
          src="https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=1920&q=80"
          alt={t("divider_alt_3")}
        />

        <SectionCrossfade from="dark" to="primary" />

        {/* ════════════════════════════════════════════════════════════
				    "Ready to Publish?" — Two-pathway cards
				    ════════════════════════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
          className="bg-accent"
          aria-labelledby="ready-heading"
        >
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-24 lg:px-14">
            {/* Header */}
            <div className="mb-10 text-center md:mb-14">
              <motion.h2
                id="ready-heading"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                className="font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl lg:text-5xl"
              >
                {t("ready_title")}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
                className="mx-auto mt-3 max-w-lg font-serif text-sm text-primary-foreground/50 md:text-base"
              >
                {t("ready_subtitle")}
              </motion.p>
            </div>

            {/* Two-pathway cards */}
            {/* Two-pathway cards */}
            <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
              {/* Pricing card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] as const }}
              >
                <Link
                  href="/pricing"
                  className="group flex h-full flex-col rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-6 transition-all duration-300 hover:border-primary-foreground/30 hover:bg-primary-foreground/10 md:p-8"
                >
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-foreground/10 text-primary-foreground">
                    <PackageIcon className="size-6" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-primary-foreground md:text-xl">
                    {t("ready_pricing_title")}
                  </h3>
                  <p className="mt-2 flex-1 font-serif text-sm leading-relaxed text-primary-foreground/60">
                    {t("ready_pricing_desc")}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 font-display text-sm font-semibold text-primary-foreground transition-transform duration-200 group-hover:translate-x-1">
                    {t("ready_pricing_cta")}
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>

              {/* Showcase card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
              >
                <Link
                  href="/showcase"
                  className="group flex h-full flex-col rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-6 transition-all duration-300 hover:border-primary-foreground/30 hover:bg-primary-foreground/10 md:p-8"
                >
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-foreground/10 text-primary-foreground">
                    <BookOpenIcon className="size-6" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-primary-foreground md:text-xl">
                    {t("ready_showcase_title")}
                  </h3>
                  <p className="mt-2 flex-1 font-serif text-sm leading-relaxed text-primary-foreground/60">
                    {t("ready_showcase_desc")}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 font-display text-sm font-semibold text-primary-foreground transition-transform duration-200 group-hover:translate-x-1">
                    {t("ready_showcase_cta")}
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.section>
      </div>
    </>
  );
}
