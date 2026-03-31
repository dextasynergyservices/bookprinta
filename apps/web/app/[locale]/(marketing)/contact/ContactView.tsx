"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ClockIcon, MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { ContactForm } from "@/components/marketing/contact/ContactForm";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import {
  CONTACT_FALLBACK_SOCIAL_LINKS,
  MarketingSocialLinkList,
} from "@/components/marketing/social-link-list";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePublicMarketingSettings } from "@/hooks/usePublicMarketingSettings";
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

export function ContactView() {
  const t = useTranslations("contact");
  const prefersReduced = useReducedMotion();
  const { settings } = usePublicMarketingSettings();

  const supportEmail = settings?.contact.supportEmail?.trim() || t("details_email");
  const supportPhone = settings?.contact.supportPhone?.trim() || t("details_phone");
  const whatsappNumber = settings?.contact.whatsappNumber?.trim() || "";
  const officeAddress = settings?.contact.officeAddress?.trim() || t("details_address");
  const detailsTitle = settings?.contact.heading?.trim() || t("details_title");
  const managedSocialLinks = settings?.businessProfile.socialLinks ?? [];

  const normalizedPhoneLink = supportPhone.replace(/\s+/g, "");
  const normalizedWhatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`
    : null;

  const DETAILS = [
    {
      icon: MailIcon,
      labelKey: "details_email_label",
      value: supportEmail,
      href: `mailto:${supportEmail}`,
    },
    {
      icon: PhoneIcon,
      labelKey: "details_phone_label",
      value: supportPhone,
      href: `tel:${normalizedPhoneLink}`,
    },
    {
      icon: MessageCircleIcon,
      labelKey: "details_whatsapp_label",
      value: whatsappNumber || t("details_whatsapp"),
      href: normalizedWhatsappLink,
    },
    { icon: ClockIcon, labelKey: "details_hours_label", value: t("details_hours"), href: null },
    { icon: MapPinIcon, labelKey: "details_address_label", value: officeAddress, href: null },
  ] as const;

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
                  {detailsTitle}
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
                            {detail.value}
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
                  <MarketingSocialLinkList
                    links={managedSocialLinks}
                    fallbackLinks={CONTACT_FALLBACK_SOCIAL_LINKS}
                    className="mt-3 flex gap-3"
                    linkClassName="rounded-lg border border-white/10 text-primary-foreground/40 transition-all duration-200 hover:border-accent/50 hover:text-accent"
                    iconClassName="size-4"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            Section transition
            ════════════════════════════════════════════════════════════ */}
        {/* <SectionCrossfade from="dark" to="accent" /> */}

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
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-transparent px-10 py-4 font-display text-sm font-bold tracking-wide text-white transition-all duration-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-white/20 md:px-12 md:py-5"
              >
                <span className="relative z-10">{t("cta_button")}</span>
                <div
                  className="absolute inset-0 z-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
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
