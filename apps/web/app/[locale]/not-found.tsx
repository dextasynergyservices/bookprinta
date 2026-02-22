"use client";

import { ArrowLeft, BookOpen, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";

/**
 * Animated floating book pages — purely decorative background particles.
 * Each "page" drifts and rotates in a randomised pattern for editorial flair.
 */
function FloatingPages() {
  const pages = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    size: 20 + Math.random() * 40,
    left: 5 + Math.random() * 90,
    delay: Math.random() * 8,
    duration: 12 + Math.random() * 10,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pages.map((page) => (
        <div
          key={page.id}
          className="animate-float absolute opacity-[0.04]"
          style={{
            width: page.size,
            height: page.size * 1.4,
            left: `${page.left}%`,
            top: "-10%",
            animationDelay: `${page.delay}s`,
            animationDuration: `${page.duration}s`,
            transform: `rotate(${page.rotation}deg)`,
          }}
        >
          <svg viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <title>Decorative page</title>
            <rect
              x="1"
              y="1"
              width="38"
              height="54"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line x1="8" y1="14" x2="32" y2="14" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="20" x2="32" y2="20" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="26" x2="28" y2="26" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="32" x2="32" y2="32" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="38" x2="24" y2="38" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
      ))}
    </div>
  );
}

/**
 * Interactive decorative spine — a vertical line that subtly responds to
 * mouse movement, evoking a book binding.
 */
function BookSpine() {
  const spineRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!spineRef.current) return;
    const rect = spineRef.current.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 10;
    spineRef.current.style.transform = `translateX(-50%) skewY(${y}deg)`;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div
      ref={spineRef}
      className="absolute left-1/2 top-[15%] hidden h-[70%] w-px -translate-x-1/2 bg-linear-to-b from-transparent via-border to-transparent transition-transform duration-700 ease-out lg:block"
      aria-hidden="true"
    />
  );
}

/**
 * Animated counter that rolls through digits before arriving at "404".
 */
function AnimatedHeading({ text }: { text: string }) {
  const [display, setDisplay] = useState("000");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);

      if (progress < 1) {
        const randomised = text
          .split("")
          .map((char, i) => {
            // Settle each digit progressively (left to right)
            const charThreshold = (i + 1) / text.length;
            if (progress > charThreshold) return char;
            return String(Math.floor(Math.random() * 10));
          })
          .join("");
        setDisplay(randomised);
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
        setSettled(true);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <span
      className={`inline-block transition-opacity duration-500 ${settled ? "opacity-100" : "opacity-70"}`}
    >
      {display}
    </span>
  );
}

export default function NotFoundPage() {
  const t = useTranslations("not_found");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      {/* Decorative elements */}
      <FloatingPages />
      <BookSpine />

      {/* Subtle radial glow behind the heading */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <div className="h-125 w-125 rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 mx-auto flex max-w-xl flex-col items-center text-center transition-all duration-700 ease-out ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        {/* 404 heading */}
        <h1 className="font-display text-[8rem] leading-none font-bold tracking-tighter text-foreground/10 select-none sm:text-[10rem] md:text-[12rem]">
          <AnimatedHeading text={t("heading")} />
        </h1>

        {/* Subheading */}
        <h2 className="-mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:-mt-6 md:text-4xl">
          {t("subheading")}
        </h2>

        {/* Decorative divider */}
        <div className="mt-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px w-12 bg-border" />
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="h-px w-12 bg-border" />
        </div>

        {/* Description */}
        <p className="mt-6 max-w-md font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
          {t("description")}
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Button
            asChild
            size="lg"
            className="rounded-full bg-accent px-8 font-display text-sm font-semibold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:shadow-lg"
          >
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              {t("back_home")}
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full border-border px-8 font-display text-sm font-semibold transition-all hover:bg-muted"
          >
            <Link href="/showcase">
              <BookOpen className="mr-2 size-4" />
              {t("browse_books")}
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            size="lg"
            className="rounded-full px-8 font-display text-sm font-semibold text-muted-foreground transition-all hover:text-foreground"
          >
            <Link href="/contact">
              <Mail className="mr-2 size-4" />
              {t("contact_us")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-border to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
