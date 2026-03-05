"use client";

import { AlertCircle, BookOpen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { BookProgressTracker } from "@/components/dashboard/book-progress-tracker";
import { Button } from "@/components/ui/button";
import { useBookProgress } from "@/hooks/useBookProgress";
import { useOrders } from "@/hooks/useOrders";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  BOOK_PROGRESS_STAGES,
  type BookProgressStage,
  type BookProgressTimelineStep,
} from "@/types/book-progress";

const STAGE_LABEL_KEYS: Record<BookProgressStage, string> = {
  PAYMENT_RECEIVED: "book_progress_stage_payment_received",
  DESIGNING: "book_progress_stage_designing",
  DESIGNED: "book_progress_stage_designed",
  FORMATTING: "book_progress_stage_formatting",
  FORMATTED: "book_progress_stage_formatted",
  REVIEW: "book_progress_stage_review",
  APPROVED: "book_progress_stage_approved",
  PRINTING: "book_progress_stage_printing",
  PRINTED: "book_progress_stage_printed",
  SHIPPING: "book_progress_stage_shipping",
  DELIVERED: "book_progress_stage_delivered",
};

const STATE_LABEL_KEYS: Record<BookProgressTimelineStep["state"], string> = {
  completed: "book_progress_state_completed",
  current: "book_progress_state_current",
  upcoming: "book_progress_state_upcoming",
  rejected: "book_progress_state_rejected",
};
const MOBILE_SKELETON_STAGES = BOOK_PROGRESS_STAGES.slice(0, 6);
const DESKTOP_SKELETON_STAGES = BOOK_PROGRESS_STAGES;

function resolveBookId(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveLinkedBookId(orders: { bookId: string | null }[]): string | null {
  for (const order of orders) {
    const linkedBookId = resolveBookId(order.bookId);
    if (linkedBookId) return linkedBookId;
  }

  return null;
}

function toStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function BookProgressSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-6">
      <p className="font-sans text-xs text-[#bdbdbd]">{title}</p>
      <p className="font-sans mt-1 text-sm text-[#8f8f8f]">{description}</p>

      <div className="mt-5 grid gap-4 md:hidden">
        {MOBILE_SKELETON_STAGES.map((stage) => (
          <div key={`books-mobile-skeleton-${stage}`} className="grid grid-cols-[2rem_1fr] gap-3">
            <div className="flex flex-col items-center">
              <div className="size-8 animate-pulse rounded-full bg-[#2A2A2A]" />
              <div className="mt-1 h-10 w-1 animate-pulse rounded bg-[#2A2A2A]" />
            </div>
            <div className="pt-1 pb-3">
              <div className="h-4 w-32 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[#2A2A2A]" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 hidden md:block">
        <div className="grid grid-cols-11 gap-2">
          {DESKTOP_SKELETON_STAGES.map((stage, index) => (
            <div key={`books-desktop-skeleton-${stage}`} className="min-w-0">
              <div className="flex items-center">
                <div className="size-8 animate-pulse rounded-full bg-[#2A2A2A]" />
                {index < 10 ? (
                  <div className="ml-2 h-1 flex-1 animate-pulse rounded bg-[#2A2A2A]" />
                ) : null}
              </div>
              <div className="mt-3 h-3 w-16 animate-pulse rounded bg-[#2A2A2A]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type BooksErrorStateProps = {
  title: string;
  description: string;
  retryLabel: string;
  loadingLabel: string;
  onRetry: () => void;
  isRetrying: boolean;
};

function BooksErrorState({
  title,
  description,
  retryLabel,
  loadingLabel,
  onRetry,
  isRetrying,
}: BooksErrorStateProps) {
  return (
    <section className="rounded-2xl border border-[#ef4444]/45 bg-[#111111] p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#ef4444]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
          <p className="font-sans mt-1 text-sm text-[#d0d0d0]">{description}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="font-sans mt-4 min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 text-white hover:bg-[#151515]"
          >
            {isRetrying ? loadingLabel : retryLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

type BooksEmptyStateProps = {
  title: string;
  description: string;
  ctaLabel: string;
};

function BooksEmptyState({ title, description, ctaLabel }: BooksEmptyStateProps) {
  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <BookOpen className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm text-[#d0d0d0] md:text-base">{description}</p>
      <Link
        href="/dashboard/orders"
        className="font-sans mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}

function BookMetadataPanel({
  tDashboard,
  manuscriptStatus,
  formattingState,
  reviewState,
  previewReady,
  rejectionReason,
  wordCount,
  pageCount,
  bookId,
}: {
  tDashboard: (key: string) => string;
  manuscriptStatus: string;
  formattingState: string;
  reviewState: string;
  previewReady: string;
  rejectionReason: string;
  wordCount: string;
  pageCount: string;
  bookId: string;
}) {
  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-5">
      <h2 className="font-display text-base font-semibold tracking-tight text-white md:text-lg">
        {tDashboard("book_progress_metadata_title")}
      </h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_book_id")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{bookId}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_manuscript_status")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{manuscriptStatus}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_formatting")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{formattingState}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_review")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{reviewState}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_preview")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{previewReady}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_rejection")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{rejectionReason}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_word_count")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{wordCount}</dd>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
          <dt className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_meta_page_count")}
          </dt>
          <dd className="font-sans mt-1 text-sm text-[#d9d9d9]">{pageCount}</dd>
        </div>
      </dl>
    </section>
  );
}

export function BooksView() {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const requestedBookId = resolveBookId(searchParams.get("bookId"));
  const shouldResolveFromOrders = requestedBookId === null;

  const {
    items: recentOrders,
    isInitialLoading: isOrdersInitialLoading,
    isError: isOrdersError,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useOrders({
    page: 1,
    pageSize: 10,
    enabled: shouldResolveFromOrders,
  });

  const fallbackBookId = useMemo(
    () => (shouldResolveFromOrders ? resolveLinkedBookId(recentOrders) : null),
    [recentOrders, shouldResolveFromOrders]
  );
  const resolvedBookId = requestedBookId ?? fallbackBookId;
  const isResolvingBookFromOrders = shouldResolveFromOrders && isOrdersInitialLoading;
  const hasResolverError = shouldResolveFromOrders && isOrdersError && !resolvedBookId;

  const { data, isInitialLoading, isError, isFetching, refetch, error } = useBookProgress({
    bookId: resolvedBookId,
    enabled: Boolean(resolvedBookId),
  });

  const stageLabels = useMemo(() => {
    return BOOK_PROGRESS_STAGES.reduce(
      (accumulator, stage) => {
        accumulator[stage] = tDashboard(STAGE_LABEL_KEYS[stage]);
        return accumulator;
      },
      {} as Record<BookProgressStage, string>
    );
  }, [tDashboard]);

  const stateLabels = useMemo(() => {
    return (Object.keys(STATE_LABEL_KEYS) as BookProgressTimelineStep["state"][]).reduce(
      (accumulator, state) => {
        accumulator[state] = tDashboard(STATE_LABEL_KEYS[state]);
        return accumulator;
      },
      {} as Record<BookProgressTimelineStep["state"], string>
    );
  }, [tDashboard]);

  const errorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : tDashboard("book_progress_error_description");

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tDashboard("book_progress_title")}
        </h1>
        <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
          {tDashboard("book_progress_subtitle")}
        </p>
      </header>

      {isResolvingBookFromOrders ? (
        <BookProgressSkeleton
          title={tDashboard("book_progress_loading_title")}
          description={tDashboard("book_progress_loading_description")}
        />
      ) : hasResolverError ? (
        <BooksErrorState
          title={tDashboard("book_progress_error_title")}
          description={tDashboard("book_progress_error_description")}
          retryLabel={tDashboard("book_progress_retry")}
          loadingLabel={tCommon("loading")}
          onRetry={() => refetchOrders()}
          isRetrying={isOrdersFetching}
        />
      ) : !resolvedBookId ? (
        <BooksEmptyState
          title={tDashboard("book_progress_empty_title")}
          description={tDashboard("book_progress_empty_description")}
          ctaLabel={tDashboard("book_progress_empty_cta")}
        />
      ) : isInitialLoading ? (
        <BookProgressSkeleton
          title={tDashboard("book_progress_loading_title")}
          description={tDashboard("book_progress_loading_description")}
        />
      ) : isError ? (
        <BooksErrorState
          title={tDashboard("book_progress_error_title")}
          description={errorMessage}
          retryLabel={tDashboard("book_progress_retry")}
          loadingLabel={tCommon("loading")}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <div className="space-y-3">
          <p className="font-sans text-xs text-[#bdbdbd] md:text-sm">
            {tDashboard("book_progress_current_stage", {
              stage: stageLabels[data.currentStage],
            })}
          </p>

          <BookMetadataPanel
            tDashboard={tDashboard}
            bookId={
              data.bookId ?? resolvedBookId ?? tDashboard("book_progress_meta_value_unavailable")
            }
            manuscriptStatus={
              toStatusLabel(data.currentStatus) ??
              tDashboard("book_progress_meta_value_unavailable")
            }
            formattingState={
              stateLabels[
                data.timeline.find((step) => step.stage === "FORMATTING")?.state ?? "upcoming"
              ] ?? tDashboard("book_progress_meta_value_unavailable")
            }
            reviewState={
              stateLabels[
                data.timeline.find((step) => step.stage === "REVIEW")?.state ?? "upcoming"
              ] ?? tDashboard("book_progress_meta_value_unavailable")
            }
            previewReady={
              data.previewPdfUrl
                ? tDashboard("book_progress_preview_ready")
                : tDashboard("book_progress_preview_pending")
            }
            rejectionReason={data.rejectionReason ?? tDashboard("book_progress_rejection_none")}
            wordCount={
              typeof data.wordCount === "number"
                ? new Intl.NumberFormat(
                    locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG"
                  ).format(data.wordCount)
                : tDashboard("book_progress_meta_value_unavailable")
            }
            pageCount={
              typeof data.pageCount === "number"
                ? new Intl.NumberFormat(
                    locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG"
                  ).format(data.pageCount)
                : tDashboard("book_progress_meta_value_unavailable")
            }
          />

          <BookProgressTracker
            timeline={data.timeline}
            currentStage={data.currentStage}
            rejectionReason={data.rejectionReason}
            rejectionReasonLabel={tDashboard("book_progress_rejection_reason_label")}
            locale={locale}
            ariaLabel={tDashboard("book_progress_aria")}
            stageLabels={stageLabels}
            stateLabels={stateLabels}
            className={cn(
              isFetching && !isInitialLoading ? "ring-1 ring-[#007eff]/20 transition-shadow" : null
            )}
          />

          <div className="flex flex-wrap gap-2">
            {data.previewPdfUrl ? (
              <a
                href={data.previewPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                {tDashboard("book_progress_cta_review_preview")}
              </a>
            ) : null}

            <Link
              href={data.orderId ? `/dashboard/orders/${data.orderId}` : "/dashboard/orders"}
              className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            >
              {tDashboard("book_progress_cta_open_workspace")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
