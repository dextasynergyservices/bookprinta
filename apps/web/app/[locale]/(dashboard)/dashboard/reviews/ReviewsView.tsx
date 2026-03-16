"use client";

import type { ReviewBook } from "@bookprinta/shared";
import { ImageIcon, MessageSquareText, Star } from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  BookCardSkeleton,
  DashboardErrorState,
} from "@/components/dashboard/dashboard-async-primitives";
import { useReviewState } from "@/hooks/use-dashboard-shell-data";
import { cn } from "@/lib/utils";

const REVIEW_CARD_SKELETON_KEYS = Array.from(
  { length: 6 },
  (_unused, index) => `reviews-card-skeleton-${index + 1}`
);

function resolveIntlLocale(locale: string): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-NG";
}

function formatReviewDate(value: string, locale: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function reviewCoverLoader({ src }: ImageLoaderProps) {
  return src;
}

function getSafeReviewCoverImageUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveLifecycleStatusLabel(
  lifecycleStatus: ReviewBook["lifecycleStatus"],
  tDashboard: (key: string) => string
): string {
  switch (lifecycleStatus) {
    case "PRINTED":
      return tDashboard("book_progress_stage_printed");
    case "SHIPPING":
      return tDashboard("book_progress_stage_shipping");
    case "DELIVERED":
      return tDashboard("book_progress_stage_delivered");
    case "COMPLETED":
      return tDashboard("reviews_lifecycle_completed");
    default:
      return tDashboard("orders_unknown_status");
  }
}

function ReviewsLoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {REVIEW_CARD_SKELETON_KEYS.map((key) => (
        <BookCardSkeleton key={key} />
      ))}
    </div>
  );
}

function ReviewsEmptyState() {
  const tDashboard = useTranslations("dashboard");

  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6 text-center">
      <div className="mx-auto inline-flex size-14 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-[#007eff]">
        <MessageSquareText className="size-6" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-4 text-2xl font-semibold tracking-tight text-white">
        {tDashboard("reviews_empty_title")}
      </h2>
      <p className="font-sans mx-auto mt-2 max-w-md text-sm leading-6 text-[#cfcfcf]">
        {tDashboard("reviews_empty_description")}
      </p>
    </section>
  );
}

function ReviewsErrorState({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <DashboardErrorState
      title={tDashboard("reviews_error_title")}
      description={tDashboard("reviews_error_description")}
      retryLabel={tCommon("retry")}
      loadingLabel={tCommon("loading")}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  );
}

function ReviewStatusBadge({ reviewStatus }: { reviewStatus: ReviewBook["reviewStatus"] }) {
  const tDashboard = useTranslations("dashboard");
  const isPending = reviewStatus === "PENDING";

  return (
    <span
      data-tone={isPending ? "pending" : "reviewed"}
      className={cn(
        "font-sans inline-flex min-h-8 items-center rounded-full border px-3 text-[0.7rem] font-semibold tracking-[0.08em] uppercase",
        isPending
          ? "border-[#007eff]/45 bg-[#0d1826] text-[#dbeeff]"
          : "border-emerald-500/35 bg-emerald-500/12 text-emerald-200"
      )}
    >
      {isPending ? tDashboard("review_pending") : tDashboard("review_submitted")}
    </span>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((starValue) => {
        const isFilled = rating >= starValue;

        return (
          <Star
            key={`review-star-${starValue}`}
            className={cn("size-4", isFilled ? "fill-[#007eff] text-[#007eff]" : "text-[#2A2A2A]")}
          />
        );
      })}
    </div>
  );
}

function ReviewCard({ book }: { book: ReviewBook }) {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const safeCoverUrl = getSafeReviewCoverImageUrl(book.coverImageUrl);
  const title = book.title ?? tDashboard("review_dialog_book_fallback");
  const lifecycleLabel = resolveLifecycleStatusLabel(book.lifecycleStatus, tDashboard);
  const reviewDate = book.review ? formatReviewDate(book.review.createdAt, locale) : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4">
        <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-[#2A2A2A] bg-[#0A0A0A]">
          {safeCoverUrl ? (
            <Image
              loader={reviewCoverLoader}
              unoptimized
              src={safeCoverUrl}
              alt={tDashboard("reviews_cover_alt", { title })}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#0A0A0A_0%,#131313_100%)] text-[#404040]">
              <ImageIcon className="size-8" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-display line-clamp-2 text-xl font-semibold tracking-tight text-white">
              {title}
            </h2>
            <ReviewStatusBadge reviewStatus={book.reviewStatus} />
          </div>

          <div className="mt-3">
            <p className="font-sans text-[0.68rem] font-semibold tracking-[0.12em] text-[#8f8f8f] uppercase">
              {tDashboard("reviews_lifecycle_label")}
            </p>
            <p className="font-sans mt-1 text-sm text-[#d0d0d0]">{lifecycleLabel}</p>
          </div>

          {book.review ? (
            <div className="mt-4 rounded-[20px] border border-[#2A2A2A] bg-[#090909] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStars rating={book.review.rating} />
                {reviewDate ? (
                  <span className="font-sans text-xs text-[#9f9f9f]">{reviewDate}</span>
                ) : null}
              </div>

              {book.review.comment ? (
                <p className="font-sans mt-3 line-clamp-3 text-sm leading-6 text-[#d6d6d6]">
                  {book.review.comment}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ReviewsView() {
  const tDashboard = useTranslations("dashboard");
  const { books, isLoading, isError, isFallback, isFetching, refetch } = useReviewState();

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tDashboard("reviews")}
        </h1>
        <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
          {tDashboard("reviews_page_subtitle")}
        </p>
      </header>

      {isError || isFallback ? (
        <ReviewsErrorState onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : isLoading ? (
        <ReviewsLoadingState />
      ) : books.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => (
            <ReviewCard key={book.bookId} book={book} />
          ))}
        </div>
      ) : (
        <ReviewsEmptyState />
      )}
    </section>
  );
}
