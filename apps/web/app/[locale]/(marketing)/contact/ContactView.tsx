"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRightIcon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { ContactForm } from "@/components/marketing/contact/ContactForm";
import { SectionCrossfade } from "@/components/marketing/faq/FaqAccordionItem";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@/lib/i18n/navigation";

// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ── Staggered clip-path line reveal ─────────────────────────────────────────
const lineRevealVariants = {
  hidden: { clipPath: "inset(100% 0 0 0)", y: 20 },
  visible: (i: number) => ({
    clipPath: "inset(0% 0 0 0)",
    y: 0,
    transition: { duration: 0.8, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

// ── Business Details Config ─────────────────────────────────────────────────
const DETAILS = [
  {
    icon: MailIcon,
    labelKey: "details_email_label",
    valueKey: "details_email",
    href: "mailto:hello@bookprinta.com",
  },
  {
    icon: PhoneIcon,
    labelKey: "details_phone_label",
    valueKey: "details_phone",
    href: "tel:+234XXXXXXXXX",
  },
  {
    icon: MessageCircleIcon,
    labelKey: "details_whatsapp_label",
    valueKey: "details_whatsapp",
    href: "https://wa.me/234XXXXXXXXX",
  },
  { icon: ClockIcon, labelKey: "details_hours_label", valueKey: "details_hours", href: null },
  { icon: MapPinIcon, labelKey: "details_address_label", valueKey: "details_address", href: null },
] as const;

export function ContactView() {
  const t = useTranslations("contact");
  const prefersReduced = useReducedMotion();

  // ── Lenis smooth scroll ──
  const { lenis } = useLenis();

  // ── Hero parallax (Framer Motion — scroll-based) ──
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroTextOpacity = useTransform(heroProgress, [0, 0.5], [1, 0]);
  const heroTextY = useTransform(heroProgress, [0, 0.5], [0, -60]);
  const heroImageY = useTransform(heroProgress, [0, 1], [0, 80]);

  // ── Refs for GSAP animations ──
  const detailItemsRef = useRef<(HTMLElement | null)[]>([]);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const ctaHeadingRef = useRef<HTMLHeadingElement>(null);

  // ── GSAP: Scroll-triggered detail cards (stagger from right) ──
  useEffect(() => {
    if (prefersReduced) return;

    const items = detailItemsRef.current.filter(Boolean) as HTMLElement[];
    if (items.length === 0) return;

    gsap.set(items, { opacity: 0, x: 40 });

    const trigger = ScrollTrigger.create({
      trigger: items[0]?.parentElement,
      start: "top 75%",
      once: true,
      onEnter: () => {
        gsap.to(items, {
          opacity: 1,
          x: 0,
          duration: 0.7,
          stagger: 0.1,
          ease: "power3.out",
        });
      },
    });

    return () => trigger.kill();
  }, [prefersReduced]);

  // ── GSAP + Lenis: Parallax depth on form vs details sections ──
  useEffect(() => {
    if (prefersReduced || !lenis || !formSectionRef.current || !detailsSectionRef.current) return;

    // Only on desktop (md+)
    const mql = window.matchMedia("(min-width: 768px)");
    if (!mql.matches) return;

    const formEl = formSectionRef.current;
    const detailsEl = detailsSectionRef.current;

    const handleScroll = () => {
      const rect = formEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // How far through the section we've scrolled (0 → 1)
      const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (viewportHeight + rect.height)));
      // Subtle offset — details lag slightly behind form
      const offset = progress * 30;
      detailsEl.style.transform = `translateY(${offset}px)`;
    };

    const unsub = lenis.on("scroll", handleScroll);
    return () => unsub();
  }, [prefersReduced, lenis]);

  // ── GSAP: CTA text split reveal ──
  useEffect(() => {
    if (prefersReduced || !ctaHeadingRef.current) return;

    const heading = ctaHeadingRef.current;
    const text = heading.textContent || "";
    heading.innerHTML = "";

    // Split into characters wrapped in spans
    const chars: HTMLSpanElement[] = [];
    for (const char of text) {
      const span = document.createElement("span");
      span.textContent = char === " " ? "\u00A0" : char;
      span.style.display = "inline-block";
      span.style.opacity = "0";
      span.style.transform = "translateY(20px)";
      heading.appendChild(span);
      chars.push(span);
    }

    const trigger = ScrollTrigger.create({
      trigger: heading,
      start: "top 85%",
      once: true,
      onEnter: () => {
        gsap.to(chars, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.02,
          ease: "power3.out",
        });
      },
    });

    return () => {
      trigger.kill();
      // Restore original text for SSR/hydration safety
      heading.textContent = text;
    };
  }, [prefersReduced]);

  const HERO_LINES = [
    { text: t("hero_title_1"), accent: false },
    { text: t("hero_title_2"), accent: true },
  ];

  return (
    <>
      {/* ── Scroll Progress Bar ── */}
      <ScrollProgress />

      <div className="relative bg-primary">
        {/* ════════════════════════════════════════════════════════════
            HERO — Dark bg, staggered text reveal, parallax
            ════════════════════════════════════════════════════════════ */}
        <section
          ref={heroRef}
          className="relative min-h-[55svh] overflow-hidden bg-primary sm:min-h-[60svh] md:min-h-[80svh]"
          aria-label={`${t("hero_title_1")} ${t("hero_title_2")}`}
        >
          {/* Decorative oversized @ */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-display text-[16rem] font-bold leading-none text-accent/8 md:text-[28rem] lg:text-[36rem]"
            aria-hidden="true"
          >
            @
          </motion.div>

          <div className="relative mx-auto flex min-h-[55svh] max-w-7xl flex-col items-center justify-center px-5 text-center sm:min-h-[60svh] md:min-h-[80svh] md:flex-row md:items-end md:justify-start md:text-left md:px-10 lg:px-14">
            {/* ── Text column ── */}
            <motion.div
              style={prefersReduced ? {} : { opacity: heroTextOpacity, y: heroTextY }}
              className="relative z-20 flex flex-1 flex-col items-center justify-center py-10 md:items-start md:justify-end md:max-w-[55%] md:pt-24 md:pb-20 lg:pt-28 lg:pb-28"
            >
              {/* Staggered line reveal */}
              <h1 className="font-display text-6xl font-bold leading-[1.02] tracking-tight text-primary-foreground md:text-7xl lg:text-[5.5rem]">
                {HERO_LINES.map((line, i) => (
                  <span key={line.text} className="block overflow-hidden">
                    <motion.span
                      custom={i}
                      initial={prefersReduced ? false : "hidden"}
                      animate="visible"
                      variants={lineRevealVariants}
                      className={`block ${line.accent ? "text-accent" : ""}`}
                    >
                      {line.text}
                    </motion.span>
                  </span>
                ))}
              </h1>

              {/* Subtitle */}
              <motion.p
                initial={prefersReduced ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mt-5 max-w-md border-l-[3px] border-accent pl-4 text-left font-serif text-base leading-relaxed text-primary-foreground/45 md:mt-8 md:text-lg lg:text-xl"
              >
                {t("hero_subtitle")}
              </motion.p>
            </motion.div>

            {/* ── Image column — Ken Burns ── */}
            <motion.div
              initial={prefersReduced ? false : { clipPath: "inset(100% 0 0 0)" }}
              animate={{ clipPath: "inset(0% 0 0 0)" }}
              transition={{ duration: 1.2, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={prefersReduced ? {} : { y: heroImageY }}
              className="absolute inset-y-0 right-0 z-10 w-full md:w-[50%] lg:w-[45%]"
            >
              <motion.div
                animate={prefersReduced ? {} : { scale: [1, 1.05, 1] }}
                transition={{
                  duration: 20,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }}
                className="absolute inset-0"
              >
                <Image
                  src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
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
            FORM + DETAILS — Split layout
            ════════════════════════════════════════════════════════════ */}
        <section className="relative z-30 bg-primary" aria-labelledby="contact-form-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-24 lg:px-14">
            <div className="grid gap-12 md:grid-cols-5 md:gap-16 lg:gap-20">
              {/* ── Form (takes 3 cols) ── */}
              <div ref={formSectionRef} className="md:col-span-3">
                <h2 id="contact-form-heading" className="sr-only">
                  {t("form_submit")}
                </h2>
                <ContactForm />
              </div>

              {/* ── Details (takes 2 cols) ── */}
              <div ref={detailsSectionRef} className="md:col-span-2">
                <h3 className="mb-8 font-display text-xl font-semibold text-primary-foreground md:text-2xl">
                  {t("details_title")}
                </h3>

                <ul className="space-y-6">
                  {DETAILS.map((detail, i) => {
                    const Icon = detail.icon;
                    const content = (
                      <li
                        key={detail.labelKey}
                        ref={(el) => {
                          detailItemsRef.current[i] = el;
                        }}
                        className="flex items-start gap-4"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Icon className="size-5" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground/30">
                            {t(detail.labelKey)}
                          </p>
                          <p className="mt-0.5 font-serif text-sm leading-relaxed text-primary-foreground/70 md:text-base">
                            {t(detail.valueKey)}
                          </p>
                        </div>
                      </li>
                    );

                    if (detail.href) {
                      return (
                        <a
                          key={detail.labelKey}
                          href={detail.href}
                          target={detail.href.startsWith("http") ? "_blank" : undefined}
                          rel={detail.href.startsWith("http") ? "noopener noreferrer" : undefined}
                          className="block transition-opacity hover:opacity-80"
                        >
                          {content}
                        </a>
                      );
                    }
                    return content;
                  })}
                </ul>

                {/* Social links */}
                <div className="mt-10">
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground/30">
                    {t("details_social_label")}
                  </p>
                  <div className="mt-3 flex gap-3">
                    {[
                      {
                        label: "Instagram",
                        href: "https://instagram.com/bookprinta",
                        icon: "M7.8,2H16.2C19.4,2 22,4.6 22,7.8V16.2A5.8,5.8 0 0,1 16.2,22H7.8C4.6,22 2,19.4 2,16.2V7.8A5.8,5.8 0 0,1 7.8,2M7.6,4A3.6,3.6 0 0,0 4,7.6V16.4C4,18.39 5.61,20 7.6,20H16.4A3.6,3.6 0 0,0 20,16.4V7.6C20,5.61 18.39,4 16.4,4H7.6M17.25,5.5A1.25,1.25 0 0,1 18.5,6.75A1.25,1.25 0 0,1 17.25,8A1.25,1.25 0 0,1 16,6.75A1.25,1.25 0 0,1 17.25,5.5M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z",
                      },
                      {
                        label: "Twitter / X",
                        href: "https://x.com/bookprinta",
                        icon: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
                      },
                      {
                        label: "Facebook",
                        href: "https://facebook.com/bookprinta",
                        icon: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
                      },
                    ].map((social) => (
                      <a
                        key={social.label}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        className="flex size-10 items-center justify-center rounded-lg border border-white/10 text-primary-foreground/40 transition-all duration-200 hover:border-accent/50 hover:text-accent"
                      >
                        <svg
                          className="size-4"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d={social.icon} />
                        </svg>
                        <span className="sr-only">{social.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            Section transition
            ════════════════════════════════════════════════════════════ */}
        <SectionCrossfade from="dark" to="accent" />

        {/* ════════════════════════════════════════════════════════════
            CTA — Accent blue band with text split reveal
            ════════════════════════════════════════════════════════════ */}
        <section className="bg-accent" aria-labelledby="contact-cta-heading">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-14 md:flex-row md:items-center md:justify-between md:px-10 md:py-20 lg:px-14">
            <div>
              <h2
                id="contact-cta-heading"
                ref={ctaHeadingRef}
                className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl lg:text-4xl"
              >
                {t("cta_title")}
              </h2>
              <motion.p
                initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                className="mt-2 font-serif text-sm text-white/60 md:text-base"
              >
                {t("cta_subtitle")}
              </motion.p>
            </div>
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-2 border-2 border-white bg-transparent px-8 py-4 font-sans text-sm font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:bg-white hover:text-accent"
              >
                {t("cta_button")}
                <ArrowRightIcon
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </motion.div>
          </div>
        </section>
      </div>
    </>
  );
}
