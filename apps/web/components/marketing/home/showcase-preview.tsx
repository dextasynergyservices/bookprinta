"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { ShowcaseCard } from "@/components/marketing/showcase/ShowcaseCard";
import { ShowcaseCardSkeleton } from "@/components/marketing/showcase/ShowcaseCardSkeleton";
import { useShowcase } from "@/hooks/use-showcase";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ShowcaseEntry } from "@/types/showcase";

const PREVIEW_LIMIT = 4;

export function ShowcasePreview() {
  const t = useTranslations("home");

  const { data, isLoading, isError } = useShowcase({
    q: "",
    category: "",
    sort: "date_desc",
    year: "",
  });

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];
  const previewItems = allItems.slice(0, PREVIEW_LIMIT);

  // No-op for homepage — no author modal needed
  const handleContactAuthor = (_entry: ShowcaseEntry) => {};

  return (
    <section
      className="relative overflow-hidden bg-background py-20 lg:py-32"
      id="showcase-preview"
    >
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Header */}
        <motion.div
          className="mb-14 lg:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            {t("showcase_title")}
          </h2>
          <p className="mt-4 max-w-2xl font-serif text-base text-muted-foreground lg:text-lg">
            {t("showcase_subtitle")}
          </p>
        </motion.div>

        {/* Book cards grid — matches the showcase page layout */}
        <div>
          {isLoading ? (
            <ul
              className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4"
              aria-busy="true"
              aria-label={t("showcase_title")}
            >
              {["sk-a", "sk-b", "sk-c", "sk-d"].map((id) => (
                <li key={id} className="list-none">
                  <ShowcaseCardSkeleton />
                </li>
              ))}
            </ul>
          ) : isError || previewItems.length === 0 ? (
            /* Fallback — show placeholder if API fails or no data */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="font-serif text-sm text-muted-foreground">{t("showcase_subtitle")}</p>
            </div>
          ) : (
            <ul
              className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4"
              aria-label={t("showcase_title")}
            >
              {previewItems.map((entry, index) => (
                <li key={entry.id} className="list-none">
                  <ShowcaseCard entry={entry} onContactAuthor={handleContactAuthor} index={index} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* CTA — centered button with accent background */}
        <motion.div
          className="mt-12 flex justify-center lg:mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/showcase"
            className={cn(
              "group inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5",
              "font-display text-sm font-semibold tracking-wide text-accent-foreground",
              "transition-all duration-300 hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/20",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            )}
          >
            {t("showcase_cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
