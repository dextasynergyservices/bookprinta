"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function CtaSection() {
  const t = useTranslations("home");
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!titleRef.current || !subtitleRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        titleRef.current,
        { clipPath: "inset(100% 0% 0% 0%)", y: 40 },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
            once: true,
          },
        }
      );

      gsap.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: 0.4,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
            once: true,
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-primary py-24 lg:py-36"
      id="cta-section"
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[600px] rounded-full bg-accent/8 blur-[150px]"
        aria-hidden="true"
      />

      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
        <h2
          ref={titleRef}
          className="font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-5xl lg:text-6xl"
          style={{ clipPath: "inset(100% 0% 0% 0%)" }}
        >
          {t("cta_title")}
        </h2>

        <p
          ref={subtitleRef}
          className="mx-auto mt-6 max-w-2xl font-serif text-base text-primary-foreground/60 opacity-0 lg:text-lg"
        >
          {t("cta_subtitle")}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href="/pricing"
            className={cn(
              "group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-accent px-8 py-3.5",
              "font-display text-sm font-semibold tracking-wide text-accent-foreground",
              "transition-all duration-300 hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/20",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            )}
          >
            {t("cta_primary")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/contact"
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5",
              "font-display text-sm font-medium tracking-wide text-primary-foreground/60",
              "transition-colors duration-300 hover:text-primary-foreground"
            )}
          >
            {t("cta_secondary")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
