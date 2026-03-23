"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookProgressTracker } from "@/components/dashboard/book-progress-tracker";
import { DashboardErrorState } from "@/components/dashboard/dashboard-async-primitives";
import { ManuscriptPreviewPanel } from "@/components/dashboard/manuscript-preview-panel";
import { ManuscriptUploadFlow } from "@/components/dashboard/manuscript-upload-flow";
import { ReprintSameModal } from "@/components/dashboard/reprint-same-modal";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBookReprintConfig } from "@/hooks/use-book-reprint-config";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  approveBookForProduction,
  reprocessBookManuscript,
  useBookProgress,
} from "@/hooks/useBookProgress";
import { useBookFiles, useBookPreview } from "@/hooks/useBookResources";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useOrders } from "@/hooks/useOrders";
import {
  type OnlinePaymentProvider,
  type PaymentGateway,
  payExtraPages,
  usePaymentGateways,
  verifyPayment,
} from "@/hooks/usePayments";
import {
  BOOK_PROGRESS_STAGE_LABEL_KEYS,
  normalizeWorkspaceStatusToken,
  resolveBillingGateState,
  resolveFormattingSnapshotLabel,
  resolveReviewSnapshotLabel,
  resolveWorkspaceState,
} from "@/lib/dashboard/book-workspace-summary";
import {
  formatDashboardCurrency,
  formatDashboardInteger,
  resolveDashboardLocaleTag,
  toDashboardStatusLabel,
} from "@/lib/dashboard/dashboard-formatters";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  BOOK_PROGRESS_STAGES,
  type BookProgressStage,
  type BookProgressTimelineStep,
  type BookRolloutBlockedFeature,
} from "@/types/book-progress";

const STATE_LABEL_KEYS: Record<BookProgressTimelineStep["state"], string> = {
  completed: "book_progress_state_completed",
  current: "book_progress_state_current",
  upcoming: "book_progress_state_upcoming",
  rejected: "book_progress_state_rejected",
};
const MOBILE_SKELETON_STAGES = BOOK_PROGRESS_STAGES.slice(0, 6);
const DESKTOP_SKELETON_STAGES = BOOK_PROGRESS_STAGES;
const EXTRA_PAGE_RATE_NAIRA = 10;
const WORKSPACE_APPROVED_BOOK_STATUSES = new Set([
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
]);
const WORKSPACE_REPRINT_BOOK_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES = new Set(["FORMATTING_REVIEW", "REJECTED"]);
type TranslationValues = Record<string, string | number | Date>;
type DashboardTranslator = (key: string, values?: TranslationValues) => string;

function toSentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveRolloutBodyKey(feature: BookRolloutBlockedFeature | null): string {
  switch (feature) {
    case "workspace":
      return "book_progress_rollout_workspace_disabled";
    case "manuscript_pipeline":
      return "book_progress_rollout_pipeline_disabled";
    case "billing_gate":
      return "book_progress_rollout_billing_disabled";
    case "final_pdf":
      return "book_progress_rollout_final_pdf_disabled";
    default:
      return "book_progress_rollout_pipeline_disabled";
  }
}

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

function resolveReprintInlineMessageKey(disableReason: string | null | undefined): string {
  switch (disableReason) {
    case "FINAL_PDF_MISSING":
      return "reprint_same_unavailable_inline_final_pdf";
    default:
      return "reprint_same_unavailable_inline_generic";
  }
}
const STAGE_LABEL_KEYS: Record<BookProgressStage, string> = BOOK_PROGRESS_STAGE_LABEL_KEYS;
const toStatusLabel = toDashboardStatusLabel;
const resolveLocaleTag = resolveDashboardLocaleTag;
const formatInteger = formatDashboardInteger;
const formatCurrency = formatDashboardCurrency;
const normalizeStatusToken = normalizeWorkspaceStatusToken;

function formatSignedInteger(value: number, locale: string): string {
  const absolute = formatInteger(Math.abs(value), locale);
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `-${absolute}`;
  return absolute;
}

function formatFileSize(value: number | null, locale: string): string | null {
  if (typeof value !== "number" || value <= 0) return null;
  const formatter = new Intl.NumberFormat(resolveLocaleTag(locale), {
    maximumFractionDigits: value >= 10 * 1024 * 1024 ? 0 : 1,
  });

  if (value >= 1024 * 1024) {
    return `${formatter.format(value / (1024 * 1024))} MB`;
  }

  if (value >= 1024) {
    return `${formatter.format(value / 1024)} KB`;
  }

  return `${formatter.format(value)} B`;
}

function formatDateTime(value: string | null, locale: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(resolveLocaleTag(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function resolveExtraPagesProvider(
  gateways: PaymentGateway[] | undefined
): Extract<OnlinePaymentProvider, "PAYSTACK" | "STRIPE"> | null {
  for (const gateway of gateways ?? []) {
    if (!gateway.isEnabled) continue;
    if (gateway.provider === "PAYSTACK" || gateway.provider === "STRIPE") {
      return gateway.provider;
    }
  }

  return null;
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
    <DashboardErrorState
      title={title}
      description={description}
      retryLabel={retryLabel}
      loadingLabel={loadingLabel}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
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
          <dd className="font-sans mt-1 text-sm leading-snug break-all text-[#d9d9d9]">{bookId}</dd>
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

function BookWorkspaceMetric({
  label,
  value,
  helper,
  valueClassName,
}: {
  label: string;
  value: string;
  helper?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
      <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
        {label}
      </p>
      <p className={cn("font-display mt-2 text-3xl font-semibold text-white", valueClassName)}>
        {value}
      </p>
      {helper ? <p className="font-sans mt-2 text-xs text-[#9f9f9f]">{helper}</p> : null}
    </div>
  );
}

function BookFilesPanel({
  tDashboard,
  locale,
  files,
  isLoading,
  errorMessage,
}: {
  tDashboard: DashboardTranslator;
  locale: string;
  files: {
    id: string;
    fileType: string;
    url: string;
    fileName: string | null;
    fileSize: number | null;
    version: number;
    createdAt: string | null;
  }[];
  isLoading: boolean;
  errorMessage: string | null;
}) {
  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-5">
      <div className="space-y-1.5">
        <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
          {tDashboard("book_progress_files_title")}
        </p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
          {tDashboard("book_progress_files_heading")}
        </h2>
        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("book_progress_files_description")}
        </p>
      </div>

      {isLoading && files.length === 0 ? (
        <div className="mt-4 grid gap-3">
          {[0, 1, 2].map((index) => (
            <div
              key={`book-files-loading-${index}`}
              className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4"
            >
              <div className="h-4 w-32 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-3 h-3 w-48 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-[#2A2A2A]" />
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <p
          role="alert"
          className="font-sans mt-4 rounded-xl border border-[#ef4444]/45 bg-[#111111] px-3 py-2 text-sm text-[#f3b2b2]"
        >
          {errorMessage}
        </p>
      ) : files.length === 0 ? (
        <p className="font-sans mt-4 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-3 text-sm text-[#d0d0d0]">
          {tDashboard("book_progress_files_empty")}
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {files.map((file) => {
            const createdAtLabel = formatDateTime(file.createdAt, locale);
            const fileSizeLabel = formatFileSize(file.fileSize, locale);

            return (
              <article
                key={file.id}
                className="flex flex-col gap-3 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <p className="font-display text-lg font-semibold tracking-tight text-white">
                    {toStatusLabel(file.fileType) ?? file.fileType}
                  </p>
                  <p className="font-sans text-sm text-[#d0d0d0]">
                    {file.fileName ?? tDashboard("book_progress_meta_value_unavailable")}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9f9f9f]">
                    <span>
                      {tDashboard("book_progress_files_version", {
                        version: formatInteger(file.version, locale),
                      })}
                    </span>
                    {createdAtLabel ? (
                      <span>
                        {tDashboard("book_progress_files_uploaded", {
                          date: createdAtLabel,
                        })}
                      </span>
                    ) : null}
                    {fileSizeLabel ? (
                      <span>
                        {tDashboard("book_progress_files_size", {
                          size: fileSizeLabel,
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                >
                  {tDashboard("book_progress_files_download")}
                </a>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RolloutNoticePanel({
  tDashboard,
  environment,
  blockedFeature,
  tone = "blocked",
}: {
  tDashboard: DashboardTranslator;
  environment: string;
  blockedFeature: BookRolloutBlockedFeature | null;
  tone?: "blocked" | "grandfathered";
}) {
  const isBlocked = tone === "blocked";

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 md:p-5",
        isBlocked ? "border-[#ef4444]/45 bg-[#170d0d]" : "border-[#f59e0b]/40 bg-[#1a1207]"
      )}
    >
      <div className="space-y-2">
        <p
          className={cn(
            "font-sans text-[11px] font-semibold tracking-[0.08em] uppercase",
            isBlocked ? "text-[#f3b2b2]" : "text-[#f8d7a0]"
          )}
        >
          {tDashboard(
            isBlocked ? "book_progress_rollout_title" : "book_progress_rollout_grandfathered_title"
          )}
        </p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
          {tDashboard(
            isBlocked
              ? "book_progress_rollout_heading"
              : "book_progress_rollout_grandfathered_heading"
          )}
        </h2>
        <p className="font-sans text-sm text-[#f1e7d0]">
          {tDashboard(
            isBlocked
              ? resolveRolloutBodyKey(blockedFeature)
              : "book_progress_rollout_grandfathered"
          )}
        </p>
        <p className="font-sans text-xs text-[#d7c8a6]">
          {tDashboard("book_progress_rollout_environment", {
            environment: toSentenceCase(environment),
          })}
        </p>
      </div>
    </section>
  );
}

type BookWorkspacePanelProps = {
  tDashboard: DashboardTranslator;
  locale: string;
  orderStatus: string | null;
  bookStatus: string | null;
  estimatedPages: number | null;
  pageCount: number | null;
  extraAmount: number | null;
  isOrderLoading: boolean;
  latestExtraPaymentStatus: string | null;
  forceProcessing?: boolean;
};

function BookWorkspacePanel({
  tDashboard,
  locale,
  orderStatus,
  bookStatus,
  estimatedPages,
  pageCount,
  extraAmount,
  isOrderLoading,
  latestExtraPaymentStatus,
  forceProcessing,
}: BookWorkspacePanelProps) {
  const workspaceState = resolveWorkspaceState({
    orderStatus,
    bookStatus,
    pageCount,
    isOrderLoading,
    latestExtraPaymentStatus,
    forceProcessing,
  });
  const extraPages =
    typeof extraAmount === "number" && extraAmount > 0
      ? Math.ceil(extraAmount / EXTRA_PAGE_RATE_NAIRA)
      : typeof pageCount === "number"
        ? 0
        : null;
  const pageDelta =
    typeof estimatedPages === "number" && typeof pageCount === "number"
      ? pageCount - estimatedPages
      : null;
  const stateBadgeClassName =
    workspaceState === "blocked"
      ? "border-[#ef4444]/50 bg-[#2a1111] text-[#f3b2b2]"
      : workspaceState === "action_required"
        ? "border-[#f97316]/45 bg-[#2a1609] text-[#f8caa6]"
        : workspaceState === "payment_pending"
          ? "border-[#f59e0b]/45 bg-[#2b1b08] text-[#f8d7a0]"
          : workspaceState === "unlocked"
            ? "border-[#007eff]/40 bg-[#0d1f34] text-[#d7e8ff]"
            : workspaceState === "approved"
              ? "border-[#16a34a]/35 bg-[#0d2015] text-[#c8f1d6]"
              : "border-[#2A2A2A] bg-[#0A0A0A] text-[#d0d0d0]";
  const panelClassName =
    workspaceState === "blocked"
      ? "border-[#ef4444]/45 bg-[#160d0d]"
      : workspaceState === "action_required"
        ? "border-[#f97316]/35 bg-[#181007]"
        : workspaceState === "payment_pending"
          ? "border-[#f59e0b]/40 bg-[#171106]"
          : workspaceState === "unlocked"
            ? "border-[#007eff]/30 bg-[#0b1320]"
            : workspaceState === "approved"
              ? "border-[#16a34a]/30 bg-[#0d1610]"
              : "border-[#2A2A2A] bg-[#111111]";
  const badgeKey =
    workspaceState === "blocked"
      ? "book_progress_workspace_badge_blocked"
      : workspaceState === "action_required"
        ? "book_progress_workspace_badge_action_required"
        : workspaceState === "payment_pending"
          ? "book_progress_workspace_badge_payment_pending"
          : workspaceState === "unlocked"
            ? "book_progress_workspace_badge_unlocked"
            : workspaceState === "approved"
              ? "book_progress_workspace_badge_approved"
              : "book_progress_workspace_badge_processing";
  const headingKey =
    workspaceState === "blocked"
      ? "book_progress_workspace_heading_blocked"
      : workspaceState === "action_required"
        ? "book_progress_workspace_heading_action_required"
        : workspaceState === "payment_pending"
          ? "book_progress_workspace_heading_payment_pending"
          : workspaceState === "unlocked"
            ? "book_progress_workspace_heading_unlocked"
            : workspaceState === "approved"
              ? "book_progress_workspace_heading_approved"
              : "book_progress_workspace_heading_processing";
  const descriptionKey =
    workspaceState === "blocked"
      ? "book_progress_workspace_desc_blocked"
      : workspaceState === "action_required"
        ? "book_progress_workspace_desc_action_required"
        : workspaceState === "payment_pending"
          ? "book_progress_workspace_desc_payment_pending"
          : workspaceState === "unlocked"
            ? "book_progress_workspace_desc_unlocked"
            : workspaceState === "approved"
              ? "book_progress_workspace_desc_approved"
              : "book_progress_workspace_desc_processing";
  const authoritativeValue =
    typeof pageCount === "number"
      ? formatInteger(pageCount, locale)
      : tDashboard("book_progress_workspace_value_pending");
  const deltaValue =
    pageDelta === null
      ? tDashboard("book_progress_workspace_value_pending")
      : formatSignedInteger(pageDelta, locale);
  const overageValue =
    extraPages === null
      ? tDashboard("book_progress_workspace_value_pending")
      : formatInteger(extraPages, locale);

  return (
    <section className={cn("rounded-2xl border p-4 md:p-5", panelClassName)}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
              {tDashboard("book_progress_workspace_title")}
            </p>
            <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
              {tDashboard(headingKey)}
            </h2>
            <p className="font-sans max-w-2xl text-sm text-[#d0d0d0]">
              {tDashboard(descriptionKey)}
            </p>
          </div>
          <span
            className={cn(
              "font-sans inline-flex min-h-10 items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.08em] uppercase",
              stateBadgeClassName
            )}
          >
            {tDashboard(badgeKey)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BookWorkspaceMetric
            label={tDashboard("book_progress_workspace_estimated_pages")}
            value={
              typeof estimatedPages === "number"
                ? formatInteger(estimatedPages, locale)
                : tDashboard("book_progress_meta_value_unavailable")
            }
            helper={tDashboard("book_progress_workspace_estimated_helper")}
          />
          <BookWorkspaceMetric
            label={tDashboard("book_progress_workspace_authoritative_pages")}
            value={authoritativeValue}
            helper={
              typeof pageCount === "number"
                ? tDashboard("book_progress_workspace_authoritative_helper")
                : tDashboard("book_progress_workspace_authoritative_pending")
            }
            valueClassName={typeof pageCount === "number" ? undefined : "animate-pulse"}
          />
          <BookWorkspaceMetric
            label={tDashboard("book_progress_workspace_formatting_delta")}
            value={deltaValue}
            helper={
              pageDelta === null
                ? tDashboard("book_progress_workspace_delta_pending")
                : tDashboard("book_progress_workspace_delta_helper")
            }
            valueClassName={
              pageDelta === null
                ? "animate-pulse"
                : pageDelta > 0
                  ? "text-[#f8d7a0]"
                  : pageDelta < 0
                    ? "text-[#c8f1d6]"
                    : undefined
            }
          />
          <BookWorkspaceMetric
            label={tDashboard("book_progress_workspace_overage_pages")}
            value={overageValue}
            helper={
              extraPages === null
                ? tDashboard("book_progress_workspace_overage_pending")
                : extraPages > 0
                  ? tDashboard("book_progress_workspace_overage_helper")
                  : tDashboard("book_progress_workspace_overage_clear")
            }
            valueClassName={
              extraPages === null ? "animate-pulse" : extraPages > 0 ? "text-[#f3b2b2]" : undefined
            }
          />
        </div>
      </div>
    </section>
  );
}

type BillingGatePanelProps = {
  tDashboard: DashboardTranslator;
  locale: string;
  orderStatus: string | null;
  bookStatus: string | null;
  pageCount: number | null;
  extraAmount: number | null;
  isOrderLoading: boolean;
  latestExtraPaymentStatus: string | null;
  forceProcessing?: boolean;
  isPaymentGatewayLoading: boolean;
  isPaymentGatewayUnavailable: boolean;
  isOffline: boolean;
  offlineNotice: string;
  isPayingExtra: boolean;
  isApprovingBook: boolean;
  actionError: string | null;
  actionSuccess: string | null;
  onPayExtraPages: () => void;
  onApproveBook: () => void;
};

function BillingGatePanel({
  tDashboard,
  locale,
  orderStatus,
  bookStatus,
  pageCount,
  extraAmount,
  isOrderLoading,
  latestExtraPaymentStatus,
  forceProcessing,
  isPaymentGatewayLoading,
  isPaymentGatewayUnavailable,
  isOffline,
  offlineNotice,
  isPayingExtra,
  isApprovingBook,
  actionError,
  actionSuccess,
  onPayExtraPages,
  onApproveBook,
}: BillingGatePanelProps) {
  const gateState = resolveBillingGateState({
    orderStatus,
    bookStatus,
    pageCount,
    isOrderLoading,
    latestExtraPaymentStatus,
    forceProcessing,
  });
  const workspaceState = resolveWorkspaceState({
    orderStatus,
    bookStatus,
    pageCount,
    isOrderLoading,
    latestExtraPaymentStatus,
    forceProcessing,
  });
  const extraPages =
    typeof extraAmount === "number" && extraAmount > 0
      ? Math.ceil(extraAmount / EXTRA_PAGE_RATE_NAIRA)
      : 0;
  const descriptionKey =
    gateState === "processing"
      ? "book_progress_billing_gate_pending"
      : gateState === "action_required"
        ? "book_progress_billing_gate_action_required"
        : workspaceState === "payment_pending"
          ? "book_progress_billing_gate_payment_pending"
          : gateState === "payment_required"
            ? "book_progress_billing_gate_payment_required"
            : gateState === "approved"
              ? "book_progress_billing_gate_approved"
              : typeof extraAmount === "number" && extraAmount > 0
                ? "book_progress_billing_gate_paid"
                : "book_progress_billing_gate_ready";
  const containerClassName =
    workspaceState === "blocked"
      ? "border-[#ef4444]/50 bg-[#170d0d]"
      : workspaceState === "action_required"
        ? "border-[#f97316]/40 bg-[#181007]"
        : workspaceState === "payment_pending"
          ? "border-[#f59e0b]/45 bg-[#1a1207]"
          : gateState === "ready" || gateState === "approved"
            ? "border-[#007eff]/35 bg-[#0b1320]"
            : "border-[#2A2A2A] bg-[#111111]";
  const statusLabel =
    gateState === "approved"
      ? tDashboard("book_progress_workspace_badge_approved")
      : gateState === "action_required"
        ? tDashboard("book_progress_workspace_badge_action_required")
        : workspaceState === "payment_pending"
          ? tDashboard("book_progress_workspace_badge_payment_pending")
          : workspaceState === "blocked"
            ? tDashboard("book_progress_workspace_badge_blocked")
            : gateState === "ready"
              ? tDashboard("book_progress_workspace_badge_unlocked")
              : null;

  return (
    <section className={cn("rounded-2xl border p-4 md:p-5", containerClassName)}>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tDashboard("book_progress_billing_gate_title")}
          </p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
            {statusLabel ?? tDashboard("book_progress_billing_gate_processing")}
          </h2>
          <p className="font-sans text-sm text-[#d0d0d0]">{tDashboard(descriptionKey)}</p>
        </div>

        <div
          className={cn("grid gap-3", gateState === "payment_required" ? "sm:grid-cols-3" : null)}
        >
          <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
            <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
              {tDashboard("book_progress_billing_gate_page_count")}
            </p>
            <p className="font-display mt-2 text-3xl font-semibold text-white">
              {typeof pageCount === "number"
                ? formatInteger(pageCount, locale)
                : tDashboard("book_progress_meta_value_unavailable")}
            </p>
          </div>

          {gateState === "payment_required" ? (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
              <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("book_progress_billing_gate_extra_pages")}
              </p>
              <p className="font-display mt-2 text-3xl font-semibold text-white">
                {isOrderLoading
                  ? tDashboard("book_progress_meta_value_unavailable")
                  : formatInteger(extraPages, locale)}
              </p>
            </div>
          ) : null}

          {gateState === "payment_required" ? (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
              <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("book_progress_billing_gate_extra_amount")}
              </p>
              <p className="font-display mt-2 text-3xl font-semibold text-white">
                {typeof extraAmount === "number"
                  ? formatCurrency(extraAmount, locale)
                  : tDashboard("book_progress_meta_value_unavailable")}
              </p>
            </div>
          ) : null}
        </div>

        {isPaymentGatewayUnavailable && gateState === "payment_required" ? (
          <p className="font-sans rounded-xl border border-[#ef4444]/45 bg-[#111111] px-3 py-2 text-sm text-[#f3b2b2]">
            {tDashboard("book_progress_billing_gate_provider_unavailable")}
          </p>
        ) : null}

        {isOffline && gateState === "payment_required" ? (
          <p
            aria-live="polite"
            aria-atomic="true"
            className="font-sans rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-[#d0d0d0]"
          >
            {offlineNotice}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {gateState === "payment_required" ? (
            <Button
              type="button"
              onClick={onPayExtraPages}
              disabled={
                isPayingExtra || isPaymentGatewayLoading || isPaymentGatewayUnavailable || isOffline
              }
              className="font-sans min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0066d1] disabled:cursor-not-allowed disabled:bg-[#1f4f87] disabled:text-[#d0d0d0]"
            >
              {isPayingExtra
                ? tDashboard("book_progress_billing_gate_pay_loading")
                : tDashboard("book_progress_billing_gate_pay_cta")}
            </Button>
          ) : null}

          {gateState === "ready" ? (
            <Button
              type="button"
              onClick={onApproveBook}
              disabled={isApprovingBook}
              className="font-sans min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0066d1] disabled:cursor-not-allowed disabled:bg-[#1f4f87] disabled:text-[#d0d0d0]"
            >
              {isApprovingBook
                ? tDashboard("book_progress_billing_gate_approve_loading")
                : tDashboard("book_progress_billing_gate_approve_cta")}
            </Button>
          ) : null}
        </div>

        {actionError ? (
          <p
            role="alert"
            className="font-sans rounded-xl border border-[#ef4444]/45 bg-[#111111] px-3 py-2 text-sm text-[#f3b2b2]"
          >
            {actionError}
          </p>
        ) : null}

        {actionSuccess ? (
          <p
            aria-live="polite"
            className="font-sans rounded-xl border border-[#007eff]/35 bg-[#0A0A0A] px-3 py-2 text-sm text-[#d7e8ff]"
          >
            {actionSuccess}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function BooksView() {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isOnline = useOnlineStatus();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [resourceActionError, setResourceActionError] = useState<string | null>(null);
  const [isPayingExtra, setIsPayingExtra] = useState(false);
  const [isApprovingBook, setIsApprovingBook] = useState(false);
  const [isLayoutReprocessing, setIsLayoutReprocessing] = useState(false);
  const [isRetryingProcessing, setIsRetryingProcessing] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [isFileHistoryOpen, setIsFileHistoryOpen] = useState(false);
  const [previewRetryError, setPreviewRetryError] = useState<string | null>(null);
  const verifiedPaymentReferenceRef = useRef<string | null>(null);
  const reprintSameTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedBookId = resolveBookId(searchParams.get("bookId"));
  const callbackPaymentReference =
    resolveBookId(searchParams.get("reference")) ?? resolveBookId(searchParams.get("trxref"));
  const requestedReprintMode = searchParams.get("reprint");
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
  const {
    status: orderStatus,
    extraAmount,
    latestExtraPaymentStatus,
    latestPaymentProvider,
    latestPaymentReference,
    isInitialLoading: isOrderDetailInitialLoading,
    refetch: refetchOrderDetail,
  } = useOrderDetail({
    orderId: data.orderId,
    enabled: Boolean(data.orderId),
  });
  const { data: paymentGateways, isLoading: isPaymentGatewaysLoading } = usePaymentGateways(
    orderStatus === "PENDING_EXTRA_PAYMENT"
  );

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
  const activeBookId = data.bookId ?? resolvedBookId;
  const previewQuery = useBookPreview({
    bookId: activeBookId,
    enabled: false,
  });
  const filesQuery = useBookFiles({
    bookId: activeBookId,
    enabled: isFileHistoryOpen && Boolean(activeBookId),
  });
  const normalizedCurrentBookStatus = normalizeStatusToken(data.currentStatus);
  const billingStatus = orderStatus ?? data.currentStatus;
  const extraPagesProvider = resolveExtraPagesProvider(paymentGateways);
  const pendingExtraPaymentReference =
    callbackPaymentReference ??
    (orderStatus === "PENDING_EXTRA_PAYMENT" && latestExtraPaymentStatus === "PENDING"
      ? latestPaymentReference
      : null);
  const canShowReprintActions =
    activeBookId !== null &&
    normalizedCurrentBookStatus !== null &&
    WORKSPACE_REPRINT_BOOK_STATUSES.has(normalizedCurrentBookStatus);
  const {
    config: reprintConfig,
    isError: isReprintConfigError,
    isInitialLoading: isReprintConfigInitialLoading,
    refetch: refetchReprintConfig,
    error: reprintConfigError,
  } = useBookReprintConfig({
    bookId: activeBookId,
    enabled: canShowReprintActions,
  });
  const reviseReprintHref = useMemo(() => {
    if (!activeBookId) return null;

    const params = new URLSearchParams({
      orderType: "REPRINT_REVISED",
      sourceBookId: activeBookId,
    });

    return `/pricing?${params.toString()}`;
  }, [activeBookId]);
  const isReprintSameModalOpen = canShowReprintActions && requestedReprintMode === "same";
  const isReprintSameDisabled =
    canShowReprintActions &&
    !isReprintConfigInitialLoading &&
    !isReprintConfigError &&
    reprintConfig !== null &&
    !reprintConfig.canReprintSame;
  const shouldShowReprintInlineMessage =
    canShowReprintActions && isReprintSameDisabled && reprintConfig?.disableReason !== null;
  const reprintSameErrorMessage =
    reprintConfigError instanceof Error && reprintConfigError.message.trim().length > 0
      ? reprintConfigError.message
      : tDashboard("reprint_same_load_error_description");
  const isPaymentGatewayUnavailable =
    billingStatus === "PENDING_EXTRA_PAYMENT" &&
    !isPaymentGatewaysLoading &&
    extraPagesProvider === null;
  const hasManuscriptPreviewWorkspace =
    Boolean(data.pageSize && data.fontSize) &&
    (typeof data.wordCount === "number" || Boolean(data.currentHtmlUrl));
  const isWorkspaceRolloutBlocked =
    data.rollout.workspace.access === "disabled" ||
    data.rollout.manuscriptPipeline.access === "disabled";
  const isBillingRolloutBlocked =
    data.rollout.billingGate.access === "disabled" || data.rollout.finalPdf.access === "disabled";
  const blockedWorkspaceFeature =
    data.rollout.workspace.access === "disabled"
      ? "workspace"
      : data.rollout.manuscriptPipeline.access === "disabled"
        ? "manuscript_pipeline"
        : null;
  const blockedBillingFeature =
    data.rollout.finalPdf.access === "disabled"
      ? "final_pdf"
      : data.rollout.billingGate.access === "disabled"
        ? "billing_gate"
        : null;
  const fileHistoryError =
    filesQuery.error instanceof Error && filesQuery.error.message.trim().length > 0
      ? filesQuery.error.message
      : filesQuery.isError
        ? tDashboard("book_progress_files_error")
        : null;

  useEffect(() => {
    if (!isLayoutReprocessing || !activeBookId) return;

    const timer = window.setInterval(() => {
      void refetch();
      void refetchOrderDetail();
    }, 4_000);

    return () => window.clearInterval(timer);
  }, [activeBookId, isLayoutReprocessing, refetch, refetchOrderDetail]);

  useEffect(() => {
    if (!isLayoutReprocessing) return;

    const normalizedBookStatus = normalizeStatusToken(data.currentStatus);
    const layoutReady =
      Boolean(data.currentHtmlUrl) &&
      typeof data.pageCount === "number" &&
      (normalizedBookStatus === "PREVIEW_READY" ||
        (normalizedBookStatus !== null &&
          WORKSPACE_APPROVED_BOOK_STATUSES.has(normalizedBookStatus)));

    const layoutFailed =
      normalizedBookStatus !== null &&
      WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES.has(normalizedBookStatus);

    if (layoutReady || layoutFailed) {
      setIsLayoutReprocessing(false);
    }
  }, [data.currentHtmlUrl, data.currentStatus, data.pageCount, isLayoutReprocessing]);

  useEffect(() => {
    if (!pendingExtraPaymentReference || !activeBookId) {
      return;
    }

    if (verifiedPaymentReferenceRef.current === pendingExtraPaymentReference) {
      return;
    }

    if (orderStatus !== "PENDING_EXTRA_PAYMENT" && latestExtraPaymentStatus !== "PENDING") {
      return;
    }

    verifiedPaymentReferenceRef.current = pendingExtraPaymentReference;
    let cancelled = false;

    const providerHint = normalizeStatusToken(latestPaymentProvider);

    void (async () => {
      try {
        const result = await verifyPayment(pendingExtraPaymentReference, providerHint);
        if (cancelled) return;

        await Promise.allSettled([refetch(), refetchOrderDetail()]);
        if (cancelled) return;

        if (result.verified) {
          setActionError(null);
          setActionSuccess(tDashboard("book_progress_billing_gate_payment_verified"));
        }
      } catch (error) {
        if (cancelled) return;

        verifiedPaymentReferenceRef.current = null;
        setActionSuccess(null);
        setActionError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : tDashboard("book_progress_billing_gate_payment_verify_error")
        );
      } finally {
        if (!cancelled && typeof window !== "undefined" && callbackPaymentReference) {
          const url = new URL(window.location.href);
          url.searchParams.delete("reference");
          url.searchParams.delete("trxref");
          url.searchParams.delete("status");
          window.history.replaceState({}, "", url.toString());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeBookId,
    callbackPaymentReference,
    latestExtraPaymentStatus,
    latestPaymentProvider,
    orderStatus,
    pendingExtraPaymentReference,
    refetch,
    refetchOrderDetail,
    tDashboard,
  ]);

  const updateBooksWorkspaceSearchParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const nextSearch = params.toString();
    router.replace(nextSearch.length > 0 ? `${pathname}?${nextSearch}` : pathname);
  };

  const handleOpenReprintSameModal = () => {
    if (!activeBookId || isReprintSameDisabled) {
      return;
    }

    updateBooksWorkspaceSearchParams((params) => {
      params.set("bookId", activeBookId);
      params.set("reprint", "same");
    });
  };

  const handleReprintSameModalOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      handleOpenReprintSameModal();
      return;
    }

    updateBooksWorkspaceSearchParams((params) => {
      params.delete("reprint");
    });
  };

  async function handlePayExtraPages() {
    if (!activeBookId) return;

    if (!isOnline) {
      setActionSuccess(null);
      setActionError(tCommon("offline_banner"));
      return;
    }

    const dueExtraAmount = typeof extraAmount === "number" ? extraAmount : null;
    const computedExtraPages =
      typeof dueExtraAmount === "number" && dueExtraAmount > 0
        ? Math.ceil(dueExtraAmount / EXTRA_PAGE_RATE_NAIRA)
        : 0;

    if (!extraPagesProvider) {
      setActionSuccess(null);
      setActionError(tDashboard("book_progress_billing_gate_provider_unavailable"));
      return;
    }

    if (computedExtraPages < 1) {
      setActionSuccess(null);
      setActionError(tDashboard("book_progress_billing_gate_payment_error"));
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsPayingExtra(true);

    try {
      const callbackUrl =
        typeof window !== "undefined"
          ? (() => {
              const url = new URL(window.location.href);
              url.searchParams.set("bookId", activeBookId);
              return url.toString();
            })()
          : undefined;

      const response = await payExtraPages({
        bookId: activeBookId,
        provider: extraPagesProvider,
        extraPages: computedExtraPages,
        ...(callbackUrl ? { callbackUrl } : {}),
      });

      if (!response.authorizationUrl) {
        throw new Error(tDashboard("book_progress_billing_gate_payment_error"));
      }

      setActionSuccess(tDashboard("book_progress_billing_gate_payment_redirect"));

      if (typeof window !== "undefined") {
        window.location.assign(response.authorizationUrl);
      }
    } catch (actionErrorValue) {
      setActionSuccess(null);
      setActionError(
        actionErrorValue instanceof Error && actionErrorValue.message.trim().length > 0
          ? actionErrorValue.message
          : tDashboard("book_progress_billing_gate_payment_error")
      );
    } finally {
      setIsPayingExtra(false);
    }
  }

  async function handleApproveBook() {
    if (!activeBookId) return;

    setActionError(null);
    setActionSuccess(null);
    setIsApprovingBook(true);

    try {
      await approveBookForProduction({ bookId: activeBookId });
      await Promise.allSettled([refetch(), refetchOrderDetail()]);
      setActionSuccess(tDashboard("book_progress_billing_gate_success"));
    } catch (actionErrorValue) {
      setActionSuccess(null);
      setActionError(
        actionErrorValue instanceof Error && actionErrorValue.message.trim().length > 0
          ? actionErrorValue.message
          : tDashboard("book_progress_error_description")
      );
    } finally {
      setIsApprovingBook(false);
    }
  }

  async function handleRetryProcessing() {
    if (!activeBookId) return;

    setPreviewRetryError(null);
    setActionError(null);
    setActionSuccess(null);
    setResourceActionError(null);
    setIsRetryingProcessing(true);

    try {
      await reprocessBookManuscript(activeBookId);
      setIsLayoutReprocessing(true);
      await Promise.allSettled([refetch(), refetchOrderDetail()]);
    } catch (retryError) {
      setPreviewRetryError(
        retryError instanceof Error && retryError.message.trim().length > 0
          ? retryError.message
          : tDashboard("book_progress_browser_preview_retry_error")
      );
    } finally {
      setIsRetryingProcessing(false);
    }
  }

  async function handleOpenPreview() {
    if (!activeBookId) return;

    if (previewQuery.data?.previewPdfUrl) {
      if (typeof window !== "undefined") {
        window.open(previewQuery.data.previewPdfUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setResourceActionError(null);
    setIsOpeningPreview(true);

    try {
      const result = await previewQuery.refetch();
      if (result.error) {
        throw result.error;
      }

      const previewUrl = result.data?.previewPdfUrl;
      if (!previewUrl) {
        throw new Error(tDashboard("book_progress_preview_error"));
      }

      if (typeof window !== "undefined") {
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      }
    } catch (previewError) {
      setResourceActionError(
        previewError instanceof Error && previewError.message.trim().length > 0
          ? previewError.message
          : tDashboard("book_progress_preview_error")
      );
    } finally {
      setIsOpeningPreview(false);
    }
  }

  function handleToggleFileHistory() {
    setIsFileHistoryOpen((current) => !current);
  }

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      {isResolvingBookFromOrders ? (
        <BookProgressSkeleton
          title={tDashboard("book_progress_loading_title")}
          description={tDashboard("book_progress_loading_description")}
        />
      ) : hasResolverError ? (
        <BooksErrorState
          title={tDashboard("book_progress_error_title")}
          description={tDashboard("book_progress_error_description")}
          retryLabel={tCommon("retry")}
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
          retryLabel={tCommon("retry")}
          loadingLabel={tCommon("loading")}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <div className="space-y-3">
          {data.rollout.isGrandfathered ? (
            <RolloutNoticePanel
              tDashboard={tDashboard}
              environment={data.rollout.environment}
              blockedFeature={data.rollout.blockedBy}
              tone="grandfathered"
            />
          ) : null}

          {isWorkspaceRolloutBlocked ? (
            <RolloutNoticePanel
              tDashboard={tDashboard}
              environment={data.rollout.environment}
              blockedFeature={blockedWorkspaceFeature}
            />
          ) : (
            <>
              <ManuscriptUploadFlow
                bookId={data.bookId ?? resolvedBookId}
                initialTitle={data.title}
                initialPageSize={data.pageSize}
                initialFontSize={data.fontSize}
                initialEstimatedPages={data.estimatedPages}
                initialWordCount={data.wordCount}
                onUploadSuccess={() => {
                  setPreviewRetryError(null);
                  setActionError(null);
                  setActionSuccess(null);
                  setResourceActionError(null);
                  void refetch();
                  void refetchOrderDetail();
                }}
              />

              {hasManuscriptPreviewWorkspace ? (
                <ManuscriptPreviewPanel
                  bookId={data.bookId ?? resolvedBookId}
                  pageSize={data.pageSize}
                  fontSize={data.fontSize}
                  currentHtmlUrl={data.currentHtmlUrl}
                  currentStatus={data.currentStatus}
                  latestProcessingError={data.latestProcessingError}
                  pageCount={data.pageCount}
                  wordCount={data.wordCount}
                  processing={data.processing}
                  hasUploadedManuscript={typeof data.wordCount === "number"}
                  forceReprocessing={isLayoutReprocessing}
                  canRetryProcessing={Boolean(activeBookId)}
                  isRetryingProcessing={isRetryingProcessing}
                  retryProcessingError={previewRetryError}
                  onRetryProcessing={() => {
                    void handleRetryProcessing();
                  }}
                  onSettingsReprocessingStart={() => {
                    setPreviewRetryError(null);
                    setActionError(null);
                    setActionSuccess(null);
                    setResourceActionError(null);
                    setIsLayoutReprocessing(true);
                    void refetch();
                    void refetchOrderDetail();
                  }}
                  onSettingsReprocessingFailed={() => {
                    setIsLayoutReprocessing(false);
                  }}
                />
              ) : null}
            </>
          )}

          <Collapsible className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <header className="space-y-1.5">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  {tDashboard("book_progress_title")}
                </h1>
                <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
                  {tDashboard("book_progress_subtitle")}
                </p>
              </header>

              <CollapsibleTrigger className="group mt-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#0a0a0a] px-3 py-1.5 text-xs font-medium text-[#9fbce0] transition-colors hover:border-[#007eff]/50 hover:text-white">
                {tDashboard("book_progress_toggle")}
                <ChevronDown
                  className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>

            <p className="font-sans text-xs text-[#bdbdbd] md:text-sm">
              {tDashboard("book_progress_current_stage", {
                stage: stageLabels[data.currentStage],
              })}
            </p>

            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
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
                  isFetching && !isInitialLoading
                    ? "ring-1 ring-[#007eff]/20 transition-shadow"
                    : null
                )}
              />
            </CollapsibleContent>
          </Collapsible>

          {!isWorkspaceRolloutBlocked ? (
            <Collapsible className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tDashboard("book_progress_workspace_title")}
                </p>
                <CollapsibleTrigger className="group flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#0a0a0a] px-3 py-1.5 text-xs font-medium text-[#9fbce0] transition-colors hover:border-[#007eff]/50 hover:text-white">
                  {tDashboard("book_workspace_toggle")}
                  <ChevronDown
                    className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <BookWorkspacePanel
                  tDashboard={tDashboard}
                  locale={locale}
                  orderStatus={orderStatus}
                  bookStatus={data.currentStatus}
                  estimatedPages={data.estimatedPages}
                  pageCount={data.pageCount}
                  extraAmount={extraAmount}
                  isOrderLoading={isOrderDetailInitialLoading}
                  latestExtraPaymentStatus={latestExtraPaymentStatus}
                  forceProcessing={isLayoutReprocessing}
                />
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <Collapsible className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("book_progress_metadata_title")}
              </p>
              <CollapsibleTrigger className="group flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#0a0a0a] px-3 py-1.5 text-xs font-medium text-[#9fbce0] transition-colors hover:border-[#007eff]/50 hover:text-white">
                {tDashboard("book_metadata_toggle")}
                <ChevronDown
                  className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <BookMetadataPanel
                tDashboard={tDashboard}
                bookId={
                  data.bookId ??
                  resolvedBookId ??
                  tDashboard("book_progress_meta_value_unavailable")
                }
                manuscriptStatus={
                  toStatusLabel(data.currentStatus) ??
                  tDashboard("book_progress_meta_value_unavailable")
                }
                formattingState={resolveFormattingSnapshotLabel({
                  tDashboard,
                  bookStatus: data.currentStatus,
                  currentHtmlUrl: data.currentHtmlUrl,
                  processingActive: data.processing.isActive,
                  forceProcessing: isLayoutReprocessing,
                })}
                reviewState={resolveReviewSnapshotLabel({
                  tDashboard,
                  bookStatus: data.currentStatus,
                  pageCount: data.pageCount,
                  forceProcessing: isLayoutReprocessing,
                })}
                previewReady={
                  data.previewPdfUrl
                    ? tDashboard("book_progress_preview_ready")
                    : tDashboard("book_progress_preview_pending")
                }
                rejectionReason={data.rejectionReason ?? tDashboard("book_progress_rejection_none")}
                wordCount={
                  typeof data.wordCount === "number"
                    ? formatInteger(data.wordCount, locale)
                    : tDashboard("book_progress_meta_value_unavailable")
                }
                pageCount={
                  typeof data.pageCount === "number"
                    ? formatInteger(data.pageCount, locale)
                    : tDashboard("book_progress_meta_value_unavailable")
                }
              />
            </CollapsibleContent>
          </Collapsible>

          {isBillingRolloutBlocked && !data.rollout.isGrandfathered ? (
            <RolloutNoticePanel
              tDashboard={tDashboard}
              environment={data.rollout.environment}
              blockedFeature={blockedBillingFeature}
            />
          ) : (
            <BillingGatePanel
              tDashboard={tDashboard}
              locale={locale}
              orderStatus={orderStatus}
              bookStatus={data.currentStatus}
              pageCount={data.pageCount}
              extraAmount={extraAmount}
              isOrderLoading={isOrderDetailInitialLoading}
              latestExtraPaymentStatus={latestExtraPaymentStatus}
              forceProcessing={isLayoutReprocessing}
              isPaymentGatewayLoading={isPaymentGatewaysLoading}
              isPaymentGatewayUnavailable={isPaymentGatewayUnavailable}
              isOffline={!isOnline}
              offlineNotice={tCommon("offline_banner")}
              isPayingExtra={isPayingExtra}
              isApprovingBook={isApprovingBook}
              actionError={actionError}
              actionSuccess={actionSuccess}
              onPayExtraPages={() => {
                void handlePayExtraPages();
              }}
              onApproveBook={() => {
                void handleApproveBook();
              }}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {data.previewPdfUrl && data.currentHtmlUrl && !isLayoutReprocessing ? (
              <Button
                type="button"
                onClick={() => {
                  void handleOpenPreview();
                }}
                disabled={isOpeningPreview}
                className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                {isOpeningPreview
                  ? tDashboard("book_progress_cta_review_preview_loading")
                  : tDashboard("book_progress_cta_review_preview")}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={handleToggleFileHistory}
              className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#151515]"
            >
              {isFileHistoryOpen
                ? tDashboard("book_progress_cta_hide_files")
                : tDashboard("book_progress_cta_view_files")}
            </Button>

            {canShowReprintActions ? (
              <Button
                ref={reprintSameTriggerRef}
                type="button"
                variant="outline"
                onClick={handleOpenReprintSameModal}
                disabled={isReprintSameDisabled}
                className="font-sans min-h-11 rounded-full border-[#007eff] bg-transparent px-5 text-sm font-semibold text-[#007eff] shadow-none hover:border-[#3398ff] hover:bg-[#071320] hover:text-[#3398ff]"
              >
                {tDashboard("reprint_same")}
              </Button>
            ) : null}

            {canShowReprintActions && reviseReprintHref !== null ? (
              <Button
                asChild
                variant="secondary"
                className="font-sans min-h-11 rounded-full border border-[#2A2A2A] bg-[#111111] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#151515]"
              >
                <Link href={reviseReprintHref}>{tDashboard("revise_reprint")}</Link>
              </Button>
            ) : null}

            <Link
              href={data.orderId ? `/dashboard/orders/${data.orderId}` : "/dashboard/orders"}
              className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            >
              {tDashboard("book_progress_cta_open_workspace")}
            </Link>
          </div>

          {shouldShowReprintInlineMessage ? (
            <p className="font-sans text-sm leading-6 text-[#BDBDBD]">
              {tDashboard(resolveReprintInlineMessageKey(reprintConfig?.disableReason))}{" "}
              <Link
                href="/contact"
                className="font-semibold text-[#007eff] underline decoration-[#007eff]/45 underline-offset-4 transition-colors duration-150 hover:text-[#47a6ff]"
              >
                {tDashboard("reprint_same_contact_support")}
              </Link>
            </p>
          ) : null}

          {resourceActionError ? (
            <p
              role="alert"
              className="font-sans rounded-xl border border-[#ef4444]/45 bg-[#111111] px-3 py-2 text-sm text-[#f3b2b2]"
            >
              {resourceActionError}
            </p>
          ) : null}

          {isFileHistoryOpen ? (
            <BookFilesPanel
              tDashboard={tDashboard}
              locale={locale}
              files={filesQuery.data.files}
              isLoading={filesQuery.isFetching}
              errorMessage={fileHistoryError}
            />
          ) : null}
        </div>
      )}

      <ReprintSameModal
        open={isReprintSameModalOpen}
        onOpenChange={handleReprintSameModalOpenChange}
        bookTitle={data?.title ?? null}
        config={reprintConfig}
        isLoading={isReprintConfigInitialLoading}
        isError={isReprintConfigError}
        errorMessage={reprintSameErrorMessage}
        onRetry={() => {
          void refetchReprintConfig();
        }}
        returnFocusElement={reprintSameTriggerRef.current}
      />
    </section>
  );
}
