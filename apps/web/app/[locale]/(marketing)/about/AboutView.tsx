"use client";

import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@/lib/i18n/navigation";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const STAGGER_CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};

const STAGGER_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function AboutView() {
  const t = useTranslations("about");
  const prefersReducedMotion = useReducedMotion();
  const pageRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const storyContentRef = useRef<HTMLDivElement>(null);
  const statsContentRef = useRef<HTMLDivElement>(null);
  const valuesContentRef = useRef<HTMLDivElement>(null);
  const teamContentRef = useRef<HTMLDivElement>(null);
  const ctaContentRef = useRef<HTMLDivElement>(null);

  const values = useMemo(
    () => [
      {
        title: t("value_1_title"),
        body: t("value_1_body"),
      },
      {
        title: t("value_2_title"),
        body: t("value_2_body"),
      },
      {
        title: t("value_3_title"),
        body: t("value_3_body"),
      },
      {
        title: t("value_4_title"),
        body: t("value_4_body"),
      },
    ],
    [t]
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (heroContentRef.current) {
        gsap.from(".about-hero-reveal", {
          opacity: 0,
          y: 40,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: {
            trigger: heroContentRef.current,
            start: "top 88%",
            once: true,
          },
        });
      }

      const revealTargets = [
        storyContentRef.current,
        statsContentRef.current,
        valuesContentRef.current,
        teamContentRef.current,
        ctaContentRef.current,
      ].filter(Boolean) as HTMLDivElement[];

      for (const target of revealTargets) {
        gsap.from(target, {
          opacity: 0,
          y: 48,
          duration: 0.9,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: "top 80%",
            once: true,
          },
        });
      }
    }, pageRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <main
      ref={pageRef}
      className="min-h-screen bg-black text-white"
      aria-label={t("meta_og_title")}
    >
      <ScrollProgress />

      <section className="relative overflow-hidden bg-black" aria-labelledby="about-hero-heading">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <Image
            src="https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1800&q=80&fm=webp"
            alt={t("hero_image_alt")}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/75 via-black/55 to-black" />
          <div className="absolute inset-0 bg-linear-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(0,126,255,0.2),transparent_40%)]" />
        </div>

        <div
          ref={heroContentRef}
          className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col items-start justify-end px-5 pt-28 pb-16 md:px-10 md:pt-36 md:pb-20 lg:px-14 lg:pt-44 lg:pb-24"
        >
          <p className="about-hero-reveal mb-5 font-sans text-xs font-semibold uppercase tracking-[0.24em] text-white/60 md:text-sm">
            {t("hero_eyebrow")}
          </p>

          <h1
            id="about-hero-heading"
            className="about-hero-reveal max-w-4xl font-display text-4xl font-bold leading-[1.02] tracking-tight text-white md:text-6xl lg:text-7xl"
          >
            <span className="block">{t("hero_title_1")}</span>
            <span className="block text-[#007eff]">{t("hero_title_2")}</span>
          </h1>

          <p className="about-hero-reveal mt-6 max-w-2xl font-serif text-base leading-relaxed text-white/75 md:mt-8 md:text-lg lg:text-xl">
            {t("hero_subtitle")}
          </p>
        </div>
      </section>

      <section
        className="border-y border-[#2A2A2A] bg-[#111111]"
        aria-labelledby="about-story-heading"
      >
        <div
          ref={storyContentRef}
          className="mx-auto w-full max-w-4xl px-5 py-16 md:px-10 md:py-20 lg:px-14 lg:py-24"
        >
          <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.24em] text-white/55 md:text-sm">
            {t("story_eyebrow")}
          </p>
          <h2
            id="about-story-heading"
            className="max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl lg:text-5xl"
          >
            {t("story_heading")}
          </h2>

          <div className="mt-8 space-y-6 font-serif text-base leading-relaxed text-white/75 md:mt-10 md:text-lg">
            <p>{t("story_paragraph_1")}</p>
            <p>{t("story_paragraph_2")}</p>
            <p>{t("story_paragraph_3")}</p>
          </div>
        </div>
      </section>

      <section className="bg-black" aria-labelledby="about-stats-heading">
        <div
          ref={statsContentRef}
          className="mx-auto w-full max-w-7xl px-5 py-16 text-center md:px-10 md:py-20 lg:px-14 lg:py-24"
        >
          <h2
            id="about-stats-heading"
            className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-white/55 md:text-sm"
          >
            {t("stats_focus_label")}
          </h2>

          <div className="mt-4 flex flex-wrap items-end justify-center gap-x-3 gap-y-2 md:mt-6 md:gap-x-4">
            <span className="font-sans text-lg font-semibold tracking-tight text-white/80 md:text-2xl">
              {t("stats_focus_prefix")}
            </span>
            <span className="font-sans text-5xl font-extrabold leading-none tracking-tight text-[#007eff] md:text-7xl lg:text-8xl">
              {t("stats_focus_titles")}
            </span>
            <span className="font-sans text-2xl font-bold leading-none text-white/85 md:text-4xl lg:text-5xl">
              {t("stats_focus_joiner")}
            </span>
            <span className="font-sans text-5xl font-extrabold leading-none tracking-tight text-[#007eff] md:text-7xl lg:text-8xl">
              {t("stats_focus_copies")}
            </span>
          </div>

          <p className="mx-auto mt-6 max-w-3xl font-serif text-base leading-relaxed text-white/70 md:mt-8 md:text-lg">
            {t("stats_focus_subtext")}
          </p>

          {/* Temporary business decision: keep live public counters hidden until the numbers are stronger. */}
        </div>
      </section>

      <section
        className="border-y border-[#2A2A2A] bg-[#111111]"
        aria-labelledby="about-values-heading"
      >
        <div
          ref={valuesContentRef}
          className="mx-auto w-full max-w-7xl px-5 py-16 md:px-10 md:py-20 lg:px-14 lg:py-24"
        >
          <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.24em] text-white/55 md:text-sm">
            {t("values_eyebrow")}
          </p>
          <h2
            id="about-values-heading"
            className="max-w-3xl font-display text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl"
          >
            {t("values_heading")}
          </h2>

          <motion.ul
            className="mt-8 grid grid-cols-1 gap-4 md:mt-10 md:grid-cols-2 md:gap-5 lg:gap-6"
            variants={STAGGER_CONTAINER_VARIANTS}
            initial={prefersReducedMotion ? false : "hidden"}
            whileInView={prefersReducedMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-80px" }}
            aria-labelledby="about-values-heading"
          >
            {values.map((value) => (
              <motion.li
                key={value.title}
                className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6 md:p-8"
                variants={STAGGER_ITEM_VARIANTS}
              >
                <h3 className="font-display text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">
                  {value.title}
                </h3>
                <p className="mt-4 font-serif text-base leading-relaxed text-white/75 md:text-lg">
                  {value.body}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      <section className="bg-black" aria-labelledby="about-team-heading">
        <div
          ref={teamContentRef}
          className="mx-auto w-full max-w-7xl px-5 py-16 md:px-10 md:py-20 lg:px-14 lg:py-24"
        >
          <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.24em] text-white/55 md:text-sm">
            {t("team_eyebrow")}
          </p>
          <h2
            id="about-team-heading"
            className="max-w-3xl font-display text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl"
          >
            {t("team_heading")}
          </h2>

          <motion.article
            className="mt-8 overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] md:mt-10 md:grid md:grid-cols-2"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative aspect-[4/3] w-full">
              <Image
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80&fm=webp"
                alt={t("team_image_alt")}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/45 to-transparent" />
            </div>
            <div className="flex flex-col justify-center p-6 md:p-10">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
                {t("team_placeholder_title")}
              </h3>
              <p className="mt-4 font-serif text-base leading-relaxed text-white/75 md:text-lg">
                {t("team_placeholder_body")}
              </p>
            </div>
          </motion.article>
        </div>
      </section>

      <section
        className="border-t border-[#2A2A2A] bg-[#111111]"
        aria-labelledby="about-cta-heading"
      >
        <div
          ref={ctaContentRef}
          className="mx-auto w-full max-w-5xl px-5 py-16 text-center md:px-10 md:py-20 lg:px-14 lg:py-24"
        >
          <h2
            id="about-cta-heading"
            className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl"
          >
            {t("cta_heading")}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl font-serif text-base leading-relaxed text-white/75 md:mt-6 md:text-lg">
            {t("cta_subtitle")}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 md:mt-10 md:flex-row md:gap-4">
            <motion.div
              whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 24 }}
            >
              <Link
                href="/pricing"
                className="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-full bg-[#007eff] px-8 py-3 font-sans text-sm font-bold uppercase tracking-[0.08em] text-white transition-all duration-300 hover:bg-[#007eff]/90 hover:shadow-[0_0_24px_rgba(0,126,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
              >
                {t("cta_primary")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </motion.div>
            <Link
              href="/quote"
              className="inline-flex min-h-[48px] min-w-[220px] items-center justify-center rounded-full border border-[#2A2A2A] bg-transparent px-8 py-3 font-sans text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors duration-300 hover:border-[#007eff] hover:text-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
            >
              {t("cta_secondary")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
