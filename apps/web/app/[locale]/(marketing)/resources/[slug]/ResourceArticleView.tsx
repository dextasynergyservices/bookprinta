"use client";

import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { ResourceCard } from "@/components/marketing/resources";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@/lib/i18n/navigation";
import { getSafeResourceImageUrl } from "@/lib/resources-media";
import type { ResourceDetail, ResourceListItem } from "@/types/resources";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface ResourceArticleViewProps {
  article: ResourceDetail;
  safeHtmlContent: string;
  relatedArticles: ResourceListItem[];
}

export function ResourceArticleView({
  article,
  safeHtmlContent,
  relatedArticles,
}: ResourceArticleViewProps) {
  const t = useTranslations("resources");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();

  const pageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const relatedRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const heroImageUrl = useMemo(
    () => getSafeResourceImageUrl(article.coverImageUrl),
    [article.coverImageUrl]
  );

  const publishedDate = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(article.publishedAt));
  }, [article.publishedAt, locale]);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (heroRef.current) {
        gsap.from(".resource-article-hero-reveal", {
          opacity: 0,
          y: 32,
          duration: 0.82,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top 90%",
            once: true,
          },
        });
      }

      if (bodyRef.current) {
        const bodyBlocks = bodyRef.current.querySelectorAll(".resource-article-content > *");
        if (bodyBlocks.length > 0) {
          gsap.from(bodyBlocks, {
            opacity: 0,
            y: 34,
            duration: 0.72,
            ease: "power3.out",
            stagger: 0.08,
            immediateRender: false,
            scrollTrigger: {
              trigger: bodyRef.current,
              start: "top 84%",
              once: true,
            },
          });
        }
      }

      const revealSections = [relatedRef.current, ctaRef.current].filter(
        Boolean
      ) as HTMLDivElement[];
      for (const section of revealSections) {
        gsap.from(section, {
          opacity: 0,
          y: 36,
          duration: 0.75,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: section,
            start: "top 86%",
            once: true,
          },
        });
      }
    }, pageRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <article
      ref={pageRef}
      className="min-h-screen bg-black text-white"
      aria-labelledby="resource-article-title"
    >
      <ScrollProgress />

      <header ref={heroRef} className="border-b border-[#2A2A2A] bg-black">
        <div className="mx-auto w-full max-w-7xl px-5 pb-8 pt-28 md:px-10 md:pb-10 md:pt-36 lg:px-14 lg:pb-12 lg:pt-44">
          <Link
            href="/resources"
            className="resource-article-hero-reveal inline-flex min-h-[44px] min-w-[44px] items-center gap-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#007eff] uppercase transition-colors duration-300 hover:text-[#4ca5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            {t("back_to_resources")}
          </Link>
        </div>

        <div className="relative mx-auto aspect-[16/9] w-full max-w-7xl overflow-hidden border-y border-[#2A2A2A] bg-[#111111]">
          <Image
            src={heroImageUrl}
            alt={t("cover_alt", { title: article.title })}
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 to-transparent" />
        </div>

        <div className="mx-auto w-full max-w-4xl px-5 pb-14 pt-8 md:px-10 md:pb-16 md:pt-10 lg:px-0 lg:pb-20 lg:pt-12">
          {article.category ? (
            <p className="resource-article-hero-reveal inline-flex rounded-full bg-[#007eff] px-3 py-1 font-sans text-[0.7rem] font-semibold tracking-[0.08em] text-white uppercase">
              {article.category.name}
            </p>
          ) : null}

          <h1
            id="resource-article-title"
            className="resource-article-hero-reveal mt-4 font-display text-4xl leading-[0.98] font-bold tracking-tight text-white md:text-6xl lg:text-7xl"
          >
            {article.title}
          </h1>

          <div className="resource-article-hero-reveal mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-sans text-xs text-white/60 md:text-sm">
            <span>{t("article_by", { author: article.authorName })}</span>
            <span aria-hidden="true">•</span>
            <time dateTime={article.publishedAt}>
              {t("published_on")} {publishedDate}
            </time>
          </div>

          {article.excerpt ? (
            <p className="resource-article-hero-reveal mt-6 font-serif text-base leading-relaxed text-white/74 md:text-lg lg:text-xl">
              {article.excerpt}
            </p>
          ) : null}
        </div>
      </header>

      <section
        ref={bodyRef}
        className="bg-[#111111]"
        aria-labelledby="resource-article-body-heading"
      >
        <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-10 md:py-14 lg:px-0 lg:py-18">
          <h2 id="resource-article-body-heading" className="sr-only">
            {t("article_content_label")}
          </h2>

          <div
            className="resource-article-content font-serif text-base leading-relaxed text-white/86 md:text-lg [&_p]:mb-6 [&_p]:last:mb-0 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-display [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:tracking-tight [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_blockquote]:my-8 [&_blockquote]:border-l-2 [&_blockquote]:border-[#007eff] [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:text-[#007eff] [&_a]:underline [&_a]:decoration-[#007eff]/70 [&_a]:underline-offset-4 hover:[&_a]:text-[#4ca5ff] [&_img]:my-8 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-white/10 [&_img[data-align='left']]:mr-auto [&_img[data-align='center']]:mx-auto [&_img[data-align='right']]:ml-auto [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[#2A2A2A] [&_pre]:bg-black [&_pre]:p-4 [&_code]:rounded [&_code]:bg-black/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.95em]"
            // biome-ignore lint: HTML is sanitized before rendering
            dangerouslySetInnerHTML={{ __html: safeHtmlContent }}
          />
        </div>
      </section>

      {relatedArticles.length > 0 ? (
        <section
          ref={relatedRef}
          className="border-t border-[#2A2A2A] bg-black"
          aria-labelledby="related-articles-heading"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-14 md:px-10 md:py-16 lg:px-14 lg:py-20">
            <h2
              id="related-articles-heading"
              className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl"
            >
              {t("related_articles")}
            </h2>

            <ul
              className="mt-7 grid grid-cols-1 gap-4 md:mt-9 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6"
              aria-label={t("related_articles")}
            >
              {relatedArticles.map((item, index) => (
                <motion.li
                  key={item.id}
                  className="list-none"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                    delay: (index % 3) * 0.06,
                  }}
                >
                  <ResourceCard
                    item={item}
                    index={index}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section
        ref={ctaRef}
        className="border-t border-[#2A2A2A] bg-[#111111]"
        aria-labelledby="resource-article-cta-heading"
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-14 text-center md:px-10 md:py-16 lg:px-14 lg:py-20">
          <h2
            id="resource-article-cta-heading"
            className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl"
          >
            {t("article_cta_heading")}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl font-serif text-base leading-relaxed text-white/74 md:text-lg">
            {t("article_cta_subtitle")}
          </p>

          <motion.div
            className="mt-8 inline-flex"
            whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
          >
            <Link
              href="/pricing"
              className="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-full bg-[#007eff] px-8 py-3 font-sans text-sm font-bold uppercase tracking-[0.08em] text-white transition-all duration-300 hover:bg-[#007eff]/90 hover:shadow-[0_0_24px_rgba(0,126,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
            >
              {t("article_cta_button")}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </section>
    </article>
  );
}
