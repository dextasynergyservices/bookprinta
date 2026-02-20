"use client";

import { BookOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface ShowcaseEmptyStateProps {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function ShowcaseEmptyState({ hasActiveFilters, onClearFilters }: ShowcaseEmptyStateProps) {
  const t = useTranslations("showcase");

  return (
    <output className="flex flex-col items-center justify-center px-4 py-24 text-center md:py-32">
      <div className="mb-8 flex size-20 items-center justify-center bg-primary md:size-24">
        <BookOpenIcon className="size-10 text-primary-foreground md:size-12" aria-hidden="true" />
      </div>

      <h3 className="font-display text-xl font-bold tracking-tight text-foreground md:text-2xl">
        {t("no_results")}
      </h3>

      <p className="mt-3 max-w-md font-serif text-sm leading-relaxed text-muted-foreground md:text-base">
        {t("no_results_description")}
      </p>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-8 inline-flex items-center font-sans text-xs font-semibold uppercase tracking-wider text-accent transition-colors duration-300 hover:text-accent/80"
        >
          {t("clear_filters")}
        </button>
      )}
    </output>
  );
}
