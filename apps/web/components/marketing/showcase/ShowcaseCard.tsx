"use client";

import { motion } from "framer-motion";
import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ShowcaseEntry } from "@/types/showcase";

interface ShowcaseCardProps {
  entry: ShowcaseEntry;
  onContactAuthor: (entry: ShowcaseEntry) => void;
  index: number;
}

export function ShowcaseCard({ entry, onContactAuthor, index }: ShowcaseCardProps) {
  const t = useTranslations("showcase");

  const truncatedAbout =
    entry.aboutBook && entry.aboutBook.length > 100
      ? `${entry.aboutBook.slice(0, 100)}…`
      : entry.aboutBook;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden bg-primary"
    >
      {/* Cover image — full bleed */}
      <div className="relative aspect-3/4 w-full overflow-hidden">
        <Image
          src={entry.bookCoverUrl}
          alt={`${t("cover_alt", { title: entry.bookTitle })}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-out md:group-hover:scale-105"
          loading={index < 2 ? "eager" : "lazy"}
        />

        {/* Gradient overlay — always visible on mobile, intensifies on desktop hover */}
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/40 to-transparent md:from-black/70 md:via-black/20 md:opacity-70 md:transition-opacity md:duration-500 md:group-hover:opacity-100" />

        {/* Category badge — top left */}
        {entry.category && (
          <div className="absolute top-3 left-3 z-10 md:top-4 md:left-4">
            <Badge
              variant="secondary"
              className="border-0 bg-white/15 font-sans text-[0.625rem] font-medium uppercase tracking-wider text-white backdrop-blur-md md:text-[0.6875rem]"
            >
              {entry.category.name}
            </Badge>
          </div>
        )}

        {/* Content — always visible on mobile, hover-reveal extras on desktop */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-4 md:p-6">
          {/* Title — always visible */}
          <h3 className="font-display text-base font-bold leading-tight tracking-tight text-white md:text-xl">
            {entry.bookTitle}
          </h3>

          {/* Author — always visible */}
          <p className="mt-1 font-sans text-xs font-medium text-white/70 md:mt-1.5 md:text-sm">
            {entry.authorName}
          </p>

          {/* Year — always visible */}
          {entry.publishedYear && (
            <span className="mt-0.5 font-sans text-[0.625rem] font-medium uppercase tracking-widest text-white/40 md:mt-1 md:text-xs">
              {entry.publishedYear}
            </span>
          )}

          {/* About — always visible on mobile (truncated), hover-reveal on desktop */}
          {truncatedAbout && (
            <p className="mt-2 line-clamp-2 font-serif text-xs leading-relaxed text-white/55 md:mt-3 md:max-h-0 md:overflow-hidden md:text-sm md:opacity-0 md:transition-all md:duration-500 md:ease-out md:group-hover:max-h-24 md:group-hover:opacity-100">
              {truncatedAbout}
            </p>
          )}

          {/* Contact author — always visible on mobile, hover-reveal on desktop */}
          {entry.isProfileComplete && entry.userId && (
            <button
              type="button"
              onClick={() => onContactAuthor(entry)}
              className="mt-3 inline-flex w-fit items-center gap-1.5 font-sans text-[0.6875rem] font-semibold uppercase tracking-wider text-accent active:text-accent/70 md:mt-4 md:text-xs md:opacity-0 md:transition-all md:duration-500 md:ease-out md:hover:text-accent/80 md:group-hover:opacity-100"
            >
              {t("contact_author")}
              <ArrowUpRightIcon className="size-3 md:size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
