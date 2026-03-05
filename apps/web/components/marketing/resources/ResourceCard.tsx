"use client";

import { motion } from "framer-motion";
import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/i18n/navigation";
import { getSafeResourceImageUrl } from "@/lib/resources-media";
import type { ResourceListItem } from "@/types/resources";

interface ResourceCardProps {
  item: ResourceListItem;
  index: number;
  prefersReducedMotion?: boolean;
}

export function ResourceCard({
  item,
  index: _index,
  prefersReducedMotion = false,
}: ResourceCardProps) {
  const t = useTranslations("resources");
  const locale = useLocale();

  const publishedDate = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(item.publishedAt));
  }, [item.publishedAt, locale]);

  const imageUrl = useMemo(() => getSafeResourceImageUrl(item.coverImageUrl), [item.coverImageUrl]);

  return (
    <motion.article
      whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.01 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] shadow-[0_0_0_rgba(0,0,0,0)] transition-shadow duration-300 hover:shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <Image
          src={imageUrl}
          alt={t("cover_alt", { title: item.title })}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-transparent" />

        {item.category ? (
          <div className="absolute left-3 top-3 z-10 md:left-4 md:top-4">
            <Badge className="border-0 bg-[#007eff] font-sans text-[0.625rem] font-semibold tracking-[0.08em] text-white uppercase">
              {item.category.name}
            </Badge>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-5 py-5 md:px-6 md:py-6">
        <h3 className="font-display text-2xl leading-tight font-bold tracking-tight text-white md:text-[1.75rem]">
          {item.title}
        </h3>

        {item.excerpt ? (
          <p className="mt-3 line-clamp-3 font-serif text-base leading-relaxed text-white/72">
            {item.excerpt}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#2A2A2A] pt-4">
          <p className="font-sans text-[0.75rem] leading-relaxed text-white/50 md:text-xs">
            {t("published_on")} {publishedDate}
          </p>

          <Link
            href={`/resources/${item.slug}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 font-sans text-xs font-semibold tracking-[0.08em] text-[#007eff] uppercase transition-colors duration-300 hover:text-[#4ca5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
          >
            {t("read_more")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
