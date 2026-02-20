"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useShowcase } from "@/hooks/use-showcase";
import type { ShowcaseEntry, ShowcaseFilters } from "@/types/showcase";
import { ShowcaseCard } from "./ShowcaseCard";
import { ShowcaseCardSkeleton } from "./ShowcaseCardSkeleton";
import { ShowcaseEmptyState } from "./ShowcaseEmptyState";

interface ShowcaseGridProps {
  filters: ShowcaseFilters;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onContactAuthor: (entry: ShowcaseEntry) => void;
}

export function ShowcaseGrid({
  filters,
  hasActiveFilters,
  onClearFilters,
  onContactAuthor,
}: ShowcaseGridProps) {
  const t = useTranslations("showcase");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useShowcase(filters);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "200px",
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersect]);

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];

  // Loading state
  if (isLoading) {
    return (
      <ul
        className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label={t("title")}
      >
        {["sk-a", "sk-b", "sk-c", "sk-d", "sk-e", "sk-f"].map((id) => (
          <li key={id} className="list-none">
            <ShowcaseCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center md:py-24"
        role="alert"
      >
        <p className="font-sans text-sm text-muted-foreground">{t("error_loading")}</p>
      </div>
    );
  }

  // Empty state
  if (allItems.length === 0) {
    return (
      <ShowcaseEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />
    );
  }

  return (
    <>
      {/* Grid — single column on mobile, mosaic on larger screens */}
      <ul className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3" aria-label={t("title")}>
        {allItems.map((entry, index) => (
          <li key={entry.id} className="list-none">
            <ShowcaseCard entry={entry} onContactAuthor={onContactAuthor} index={index} />
          </li>
        ))}
      </ul>

      {/* Infinite scroll sentinel */}
      <div
        ref={sentinelRef}
        className="flex items-center justify-center py-8 md:py-10"
        aria-hidden="true"
      >
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 font-sans text-xs text-muted-foreground md:text-sm">
            <Spinner className="size-4" />
            <span>{t("loading_more")}</span>
          </div>
        )}
      </div>
    </>
  );
}
