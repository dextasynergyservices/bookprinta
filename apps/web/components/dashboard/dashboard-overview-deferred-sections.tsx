"use client";

import type {
  DashboardOverviewNotifications,
  DashboardOverviewProfile,
  DashboardPendingActionsSummary,
  NotificationItem,
  OrdersListItem,
  UserBookListItem,
} from "@bookprinta/shared";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpenText,
  CreditCard,
  Download,
  FileText,
  LifeBuoy,
  MessageSquareText,
  PackageCheck,
  Receipt,
  Star,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useState } from "react";
import { toast } from "sonner";
import {
  DashboardErrorState,
  DashboardSkeletonBlock,
  NotificationItemSkeleton,
} from "@/components/dashboard/dashboard-async-primitives";
import { useBookReprintConfig } from "@/hooks/use-book-reprint-config";
import { useNotificationsList } from "@/hooks/use-dashboard-shell-data";
import { useBookFiles, useBookPreview } from "@/hooks/useBookResources";
import {
  BOOK_PROGRESS_STAGE_LABEL_KEYS,
  resolveFormattingSnapshotLabel,
  resolveReviewSnapshotLabel,
  resolveWorkspaceSummary,
} from "@/lib/dashboard/book-workspace-summary";
import {
  formatDashboardDate,
  formatDashboardInteger,
  toDashboardStatusLabel,
} from "@/lib/dashboard/dashboard-formatters";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  BELOW_FOLD_SECTION_CLASS,
  EmptyState,
  EYEBROW_PILL_CLASS,
  Metric,
  PRIMARY_BUTTON_CLASS,
  QuickLinkCard,
  RecentOrderCard,
  SECONDARY_BUTTON_CLASS,
  SECTION_REVEAL_CLASS,
  SectionHeading,
  SUB_SURFACE,
  SURFACE,
} from "./dashboard-overview-shared";
import { DashboardRefundPolicyDialog } from "./dashboard-refund-policy-dialog";
import { OrderMetaText, OrderStatusBadge } from "./orders";
import { ReprintSameModal } from "./reprint-same-modal";

const SUPPORT_WHATSAPP_URL = "https://wa.me/2348103208297";
const DELIVERED_BOOK_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const ACTIVITY_FEED_PAGE_SIZE = 4;
const PREVIEW_FILE_TYPES = new Set(["PREVIEW_PDF"]);
const FINAL_FILE_TYPES = new Set(["FINAL_PDF"]);

function getApiV1BaseUrl() {
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function translateNotificationCopy(
  translate: ReturnType<typeof useTranslations>,
  key: string,
  params: NotificationItem["data"]["params"] | undefined
) {
  try {
    return translate(key as never, params as never);
  } catch {
    return key;
  }
}

function resolveNotificationFeedHref(item: NotificationItem): string | null {
  if (item.data.action?.kind === "navigate") {
    return item.data.action.href;
  }

  if (item.data.action?.kind === "open_review_dialog") {
    return "/dashboard/reviews";
  }

  return null;
}

function formatNotificationTimestamp(value: string, locale: string): string | null {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const localeTag = locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG";

  return new Intl.DateTimeFormat(localeTag, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function getNotificationFeedIcon(type: NotificationItem["type"]) {
  switch (type) {
    case "ORDER_STATUS":
      return PackageCheck;
    case "BANK_TRANSFER_RECEIVED":
      return CreditCard;
    case "PRODUCTION_DELAY":
      return AlertTriangle;
    case "REVIEW_REQUEST":
      return Star;
    default:
      return BellRing;
  }
}

function resolveDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ? match[1] : fallback;
}

function findLatestDocumentFile(
  files: Array<{
    fileType: string;
    url: string;
    version: number;
    createdAt: string | null;
  }>,
  acceptedTypes: Set<string>
) {
  return (
    files
      .filter((file) => acceptedTypes.has(file.fileType))
      .sort((left, right) => {
        if (left.version !== right.version) {
          return right.version - left.version;
        }

        const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
        const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
        return rightTime - leftTime;
      })[0] ?? null
  );
}

function _buildReprintSameHref(bookId: string): string {
  return `/dashboard/books/${bookId}?reprint=same`;
}

function buildReviseReprintHref(bookId: string): string {
  const params = new URLSearchParams({
    orderType: "REPRINT",
    sourceBookId: bookId,
  });

  return `/pricing?${params.toString()}`;
}

function resolveNextMilestoneKey(params: {
  activeBook: UserBookListItem;
  workspaceState: ReturnType<typeof resolveWorkspaceSummary>["state"];
}) {
  if (params.workspaceState === "action_required") {
    return "overview_workspace_handoff_action_required";
  }

  if (params.workspaceState === "blocked" || params.workspaceState === "payment_pending") {
    return "overview_workspace_handoff_payment";
  }

  if (params.activeBook.currentStage === "SHIPPING" || params.activeBook.status === "SHIPPING") {
    return "overview_workspace_handoff_shipping";
  }

  if (
    params.activeBook.currentStage === "DELIVERED" ||
    DELIVERED_BOOK_STATUSES.has(params.activeBook.status)
  ) {
    return "overview_workspace_handoff_delivered";
  }

  if (
    params.activeBook.currentStage === "REVIEW" ||
    params.activeBook.status === "PREVIEW_READY" ||
    params.workspaceState === "unlocked"
  ) {
    return "overview_workspace_handoff_review";
  }

  if (params.workspaceState === "approved") {
    return "overview_workspace_handoff_production";
  }

  return "overview_workspace_handoff_processing";
}

function OverviewDocumentsLoadingState() {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {["doc-skeleton-1", "doc-skeleton-2", "doc-skeleton-3"].map((key) => (
        <article key={key} className="rounded-[24px] border border-white/10 bg-[#09090B] p-4">
          <DashboardSkeletonBlock className="size-11 rounded-full" />
          <DashboardSkeletonBlock className="mt-4 h-6 w-32 rounded-full" />
          <DashboardSkeletonBlock className="mt-3 h-4 w-full rounded-full" />
          <DashboardSkeletonBlock className="mt-2 h-4 w-2/3 rounded-full" />
          <DashboardSkeletonBlock className="mt-4 h-11 w-full rounded-full" />
        </article>
      ))}
    </div>
  );
}

type DashboardOverviewDeferredSectionsProps = {
  activeBook: UserBookListItem | null;
  recentOrders: OrdersListItem[];
  notifications: DashboardOverviewNotifications;
  profile: DashboardOverviewProfile;
  pendingActions: DashboardPendingActionsSummary;
};

export function DashboardOverviewDeferredSections({
  activeBook,
  recentOrders,
  notifications,
  profile,
  pendingActions,
}: DashboardOverviewDeferredSectionsProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const t = useTranslations();
  const locale = useLocale();
  const activeBookTitleId = useId();
  const activeBookDescriptionId = useId();
  const recentOrdersTitleId = useId();
  const recentOrdersDescriptionId = useId();
  const notificationsTitleId = useId();
  const notificationsDescriptionId = useId();
  const profileTitleId = useId();
  const profileDescriptionId = useId();
  const reprintReadyTitleId = useId();
  const reprintReadyDescriptionId = useId();
  const quickLinksTitleId = useId();
  const quickLinksDescriptionId = useId();
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isRefundPolicyOpen, setIsRefundPolicyOpen] = useState(false);
  const [reprintModalBookId, setReprintModalBookId] = useState<string | null>(null);
  const isReprintModalOpen = reprintModalBookId !== null;
  const notificationsFeed = useNotificationsList({
    page: 1,
    pageSize: ACTIVITY_FEED_PAGE_SIZE,
    isOpen: true,
  });
  const previewQuery = useBookPreview({
    bookId: activeBook?.id,
    enabled: Boolean(activeBook?.id && activeBook.previewPdfUrlPresent),
  });
  const filesQuery = useBookFiles({
    bookId: activeBook?.id,
    enabled: Boolean(activeBook?.id),
  });

  const stageLabel = activeBook
    ? tDashboard(BOOK_PROGRESS_STAGE_LABEL_KEYS[activeBook.currentStage])
    : null;
  // For books in terminal production states (DELIVERED, COMPLETED), the
  // productionStatus is the meaningful user-facing value. The manuscript
  // `status` may still be an earlier lifecycle value (e.g. APPROVED).
  const effectiveBookStatus =
    activeBook && DELIVERED_BOOK_STATUSES.has(activeBook.productionStatus)
      ? activeBook.productionStatus
      : (activeBook?.status ?? null);
  const workspaceSummary = activeBook
    ? resolveWorkspaceSummary({
        orderStatus: activeBook.orderStatus,
        bookStatus: effectiveBookStatus,
        pageCount: activeBook.pageCount,
        isOrderLoading: false,
        latestExtraPaymentStatus: null,
        forceProcessing: activeBook.processing.isActive,
      })
    : null;
  const formattingState = activeBook
    ? resolveFormattingSnapshotLabel({
        tDashboard,
        bookStatus: activeBook.status,
        currentHtmlUrl:
          activeBook.previewPdfUrlPresent || typeof activeBook.pageCount === "number"
            ? activeBook.workspaceUrl
            : null,
        processingActive: activeBook.processing.isActive,
        forceProcessing: activeBook.processing.isActive,
      })
    : null;
  const reviewState = activeBook
    ? resolveReviewSnapshotLabel({
        tDashboard,
        bookStatus: activeBook.status,
        pageCount: activeBook.pageCount,
        forceProcessing: activeBook.processing.isActive,
      })
    : null;
  const activeBookTitle = activeBook?.title ?? tDashboard("overview_active_book_untitled");
  const activeOrder = activeBook
    ? (recentOrders.find((order) => order.id === activeBook.orderId) ?? null)
    : null;
  const previewFile = findLatestDocumentFile(filesQuery.data.files, PREVIEW_FILE_TYPES);
  const finalFile = findLatestDocumentFile(filesQuery.data.files, FINAL_FILE_TYPES);
  const previewDocumentHref = previewQuery.data?.previewPdfUrl ?? previewFile?.url ?? null;
  const previewDocumentNote =
    previewDocumentHref !== null
      ? tDashboard("overview_documents_preview_ready")
      : previewQuery.isError
        ? tDashboard("overview_documents_unavailable")
        : previewQuery.isPending
          ? tCommon("loading")
          : tDashboard("overview_documents_preview_pending");
  const finalDocumentNote =
    finalFile !== null
      ? tDashboard("overview_documents_final_ready")
      : filesQuery.isError
        ? tDashboard("overview_documents_unavailable")
        : filesQuery.isPending && activeBook?.finalPdfUrlPresent
          ? tCommon("loading")
          : tDashboard("overview_documents_final_pending");
  const nextMilestoneKey =
    activeBook && workspaceSummary
      ? resolveNextMilestoneKey({
          activeBook,
          workspaceState: workspaceSummary.state,
        })
      : null;
  const recentActivityItems = notificationsFeed.items.slice(0, ACTIVITY_FEED_PAGE_SIZE);
  const shouldShowDocumentsLoadingState =
    activeBook !== null &&
    filesQuery.isPending &&
    filesQuery.data.files.length === 0 &&
    previewDocumentHref === null &&
    finalFile === null;
  const reprintReadyOrders = recentOrders
    .filter(
      (order) =>
        order.book?.id !== null &&
        order.book !== null &&
        DELIVERED_BOOK_STATUSES.has(order.book.status)
    )
    .slice(0, 2);
  const isDeliveredActiveBook =
    activeBook !== null && DELIVERED_BOOK_STATUSES.has(activeBook.productionStatus);
  const reprintConfig = useBookReprintConfig({
    bookId: reprintModalBookId,
    enabled: isReprintModalOpen,
  });
  const reprintModalBookTitle = reprintModalBookId
    ? reprintModalBookId === activeBook?.id
      ? activeBookTitle
      : (reprintReadyOrders.find((o) => o.book?.id === reprintModalBookId)?.package.name ?? null)
    : null;

  const handleDownloadInvoice = useCallback(async () => {
    if (!activeBook?.orderId) {
      return;
    }

    setIsDownloadingInvoice(true);
    try {
      const endpoint = `${API_V1_BASE_URL}/orders/${encodeURIComponent(activeBook.orderId)}/invoice`;
      const requestInvoice = () =>
        fetch(endpoint, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

      const downloadFromResponse = async (response: Response) => {
        const fileName = resolveDownloadFileName(
          response.headers.get("content-disposition"),
          `bookprinta-invoice-${activeOrder?.orderNumber ?? activeBook.orderId}.pdf`
        );
        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = "noopener noreferrer";
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);
      };

      const firstAttempt = await requestInvoice();
      if (firstAttempt.ok) {
        await downloadFromResponse(firstAttempt);
        toast.success(tDashboard("order_journey_invoice_ready"));
        return;
      }

      const archiveResponse = await fetch(
        `${API_V1_BASE_URL}/orders/${encodeURIComponent(activeBook.orderId)}/invoice/archive`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!archiveResponse.ok) {
        throw new Error("Invoice archive fallback failed");
      }

      const secondAttempt = await requestInvoice();
      if (!secondAttempt.ok) {
        throw new Error("Invoice download failed");
      }

      await downloadFromResponse(secondAttempt);
      toast.success(tDashboard("order_journey_invoice_ready"));
    } catch {
      toast.error(tDashboard("order_journey_invoice_error"));
    } finally {
      setIsDownloadingInvoice(false);
    }
  }, [activeBook, activeOrder?.orderNumber, tDashboard]);

  return (
    <div className="space-y-5 md:space-y-7">
      <section
        aria-labelledby={activeBookTitleId}
        aria-describedby={activeBookDescriptionId}
        className={cn(SURFACE, SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_active_book_eyebrow")}
          title={tDashboard("overview_active_book_title")}
          description={tDashboard("overview_active_book_description")}
          titleId={activeBookTitleId}
          descriptionId={activeBookDescriptionId}
        />

        {activeBook ? (
          <>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
              <div className={cn(SUB_SURFACE, "overflow-hidden p-4 md:p-5")}>
                <div className="flex items-start gap-4">
                  {activeBook.coverImageUrl ? (
                    <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-[#050505] shadow-[0_16px_40px_rgba(0,0,0,0.32)] md:w-24">
                      <Image
                        src={activeBook.coverImageUrl}
                        alt={tDashboard("reviews_cover_alt", {
                          title: activeBookTitle,
                        })}
                        fill
                        loading="lazy"
                        sizes="(min-width: 768px) 96px, 80px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF] shadow-[0_10px_28px_rgba(0,126,255,0.14)]"
                    >
                      <BookOpenText className="size-5" aria-hidden="true" />
                    </span>
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {workspaceSummary?.state !== "delivered" ? (
                        <OrderStatusBadge
                          orderStatus={activeBook.orderStatus}
                          bookStatus={effectiveBookStatus}
                          label={
                            toDashboardStatusLabel(effectiveBookStatus ?? activeBook.orderStatus) ??
                            tDashboard("orders_unknown_status")
                          }
                        />
                      ) : null}
                      {workspaceSummary ? (
                        <span
                          className={cn(
                            "font-sans inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                            workspaceSummary.stateBadgeClassName
                          )}
                        >
                          {tDashboard(workspaceSummary.badgeKey)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="font-display mt-3 max-w-[12ch] text-[2.35rem] leading-[0.94] font-semibold tracking-[-0.05em] text-white">
                      {activeBookTitle}
                    </h3>
                    <p className="mt-4 max-w-[28rem] font-serif text-base leading-7 text-[#C0C0C0]">
                      {workspaceSummary
                        ? tDashboard(workspaceSummary.descriptionKey)
                        : tDashboard("overview_active_book_body")}
                    </p>
                  </div>
                </div>

                <dl className="mt-7 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className={cn(SUB_SURFACE, "px-4 py-3")}>
                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                      {tDashboard("overview_current_stage")}
                    </dt>
                    <dd className="mt-2 font-sans text-sm font-medium text-white">{stageLabel}</dd>
                  </div>
                  <div className={cn(SUB_SURFACE, "px-4 py-3")}>
                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                      {tDashboard("book_progress_meta_formatting")}
                    </dt>
                    <dd className="mt-2 font-sans text-sm font-medium text-white">
                      {formattingState}
                    </dd>
                  </div>
                  <div className={cn(SUB_SURFACE, "px-4 py-3")}>
                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                      {tDashboard("book_progress_meta_review")}
                    </dt>
                    <dd className="mt-2 font-sans text-sm font-medium text-white">{reviewState}</dd>
                  </div>
                  <div className={cn(SUB_SURFACE, "px-4 py-3")}>
                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                      {tDashboard("overview_last_updated")}
                    </dt>
                    <dd className="mt-2 font-sans text-sm font-medium text-white">
                      {formatDashboardDate(activeBook.updatedAt, locale) ??
                        tDashboard("orders_unknown_date")}
                    </dd>
                  </div>
                </dl>
              </div>

              <div
                className={cn(
                  "relative flex flex-col justify-between overflow-hidden rounded-[26px] border p-4 md:p-5",
                  workspaceSummary?.panelClassName ?? SUB_SURFACE
                )}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#007eff]/0 via-[#007eff]/50 to-[#007eff]/0"
                />
                <div>
                  <p className={EYEBROW_PILL_CLASS}>
                    {tDashboard("book_progress_workspace_title")}
                  </p>
                  {workspaceSummary ? (
                    <span
                      className={cn(
                        "font-sans mt-4 inline-flex min-h-10 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
                        workspaceSummary.stateBadgeClassName
                      )}
                    >
                      {tDashboard(workspaceSummary.badgeKey)}
                    </span>
                  ) : null}
                  <h3 className="font-display mt-4 max-w-[11ch] text-[2.3rem] leading-[0.95] font-semibold tracking-[-0.05em] text-white">
                    {workspaceSummary
                      ? tDashboard(workspaceSummary.headingKey)
                      : tDashboard("overview_workspace_title")}
                  </h3>
                  <p className="mt-4 font-serif text-base leading-7 text-[#B8B8B8]">
                    {workspaceSummary
                      ? tDashboard(workspaceSummary.descriptionKey)
                      : tDashboard("overview_workspace_description")}
                  </p>
                  {nextMilestoneKey ? (
                    <div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                        {tDashboard("overview_workspace_handoff_label")}
                      </p>
                      <p className="mt-2 font-serif text-sm leading-6 text-[#E6E6E6]">
                        {tDashboard(nextMilestoneKey)}
                      </p>
                    </div>
                  ) : null}
                  <dl className="mt-6 grid gap-3 md:grid-cols-2">
                    <div>
                      <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8D8D8D]">
                        {tDashboard("book_progress_workspace_estimated_pages")}
                      </dt>
                      <dd className="mt-1">
                        <OrderMetaText>
                          {typeof activeBook.estimatedPages === "number"
                            ? formatDashboardInteger(activeBook.estimatedPages, locale)
                            : tDashboard("book_progress_meta_value_unavailable")}
                        </OrderMetaText>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8D8D8D]">
                        {tDashboard("book_progress_workspace_authoritative_pages")}
                      </dt>
                      <dd className="mt-1">
                        <OrderMetaText>
                          {typeof activeBook.pageCount === "number"
                            ? formatDashboardInteger(activeBook.pageCount, locale)
                            : tDashboard("book_progress_workspace_value_pending")}
                        </OrderMetaText>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {isDeliveredActiveBook ? (
                    <>
                      <Button
                        className={PRIMARY_BUTTON_CLASS}
                        aria-label={`${tDashboard("reprint_same")}: ${activeBookTitle}`}
                        onClick={() => setReprintModalBookId(activeBook.id)}
                      >
                        {tDashboard("reprint_same")}
                      </Button>
                      <Button
                        asChild
                        className="font-sans inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#007eff]/35 bg-[#071320] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#3398ff] hover:bg-[#0d1b2d] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                      >
                        <Link
                          href={buildReviseReprintHref(activeBook.id)}
                          aria-label={`${tDashboard("revise_reprint")}: ${activeBookTitle}`}
                        >
                          {tDashboard("revise_reprint")}
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button asChild className={PRIMARY_BUTTON_CLASS}>
                      <Link
                        href={activeBook.workspaceUrl}
                        aria-label={`${tDashboard("book_progress_cta_open_workspace")}: ${activeBookTitle}`}
                      >
                        {tDashboard("book_progress_cta_open_workspace")}
                      </Link>
                    </Button>
                  )}
                  <Button asChild className={SECONDARY_BUTTON_CLASS}>
                    <Link
                      href={activeBook.trackingUrl}
                      aria-label={`${tDashboard("orders_action_track")}: ${activeBookTitle}`}
                    >
                      {tDashboard("orders_action_track")}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className={cn(SUB_SURFACE, "mt-5 overflow-hidden p-4 md:p-5")}>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_documents_eyebrow")}</p>
                  <h3 className="font-display mt-4 max-w-[11ch] text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
                    {tDashboard("overview_documents_title")}
                  </h3>
                  <p className="mt-3 max-w-[32rem] font-serif text-base leading-7 text-[#B8B8B8]">
                    {tDashboard("overview_documents_description")}
                  </p>
                </div>
                <Link
                  href={activeBook.workspaceUrl}
                  className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                >
                  {tDashboard("overview_quick_open")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              {shouldShowDocumentsLoadingState ? (
                <OverviewDocumentsLoadingState />
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <article className="rounded-[24px] border border-white/10 bg-[#09090B] p-4">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-11 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF]"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <h4 className="font-display mt-4 text-xl font-semibold text-white">
                      {tDashboard("overview_documents_preview_title")}
                    </h4>
                    <p className="mt-2 min-h-12 font-sans text-sm leading-6 text-[#B8B8B8]">
                      {previewDocumentNote}
                    </p>
                    {previewDocumentHref ? (
                      <a
                        href={previewDocumentHref}
                        target="_blank"
                        rel="noreferrer"
                        className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                      >
                        {tDashboard("overview_documents_open")}
                      </a>
                    ) : (
                      <span className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/10 bg-[#060606] px-4 py-2 text-sm font-semibold text-[#747474]">
                        {tDashboard("overview_documents_pending")}
                      </span>
                    )}
                  </article>

                  <article className="rounded-[24px] border border-white/10 bg-[#09090B] p-4">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-11 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF]"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <h4 className="font-display mt-4 text-xl font-semibold text-white">
                      {tDashboard("overview_documents_final_title")}
                    </h4>
                    <p className="mt-2 min-h-12 font-sans text-sm leading-6 text-[#B8B8B8]">
                      {finalDocumentNote}
                    </p>
                    {finalFile ? (
                      <a
                        href={finalFile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                      >
                        {tDashboard("overview_documents_open")}
                      </a>
                    ) : (
                      <span className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/10 bg-[#060606] px-4 py-2 text-sm font-semibold text-[#747474]">
                        {tDashboard("overview_documents_pending")}
                      </span>
                    )}
                  </article>

                  <article className="rounded-[24px] border border-white/10 bg-[#09090B] p-4">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-11 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF]"
                    >
                      <Receipt className="size-4" aria-hidden="true" />
                    </span>
                    <h4 className="font-display mt-4 text-xl font-semibold text-white">
                      {tDashboard("overview_documents_invoice_title")}
                    </h4>
                    <p className="mt-2 min-h-12 font-sans text-sm leading-6 text-[#B8B8B8]">
                      {tDashboard("overview_documents_invoice_ready")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDownloadInvoice();
                      }}
                      disabled={isDownloadingInvoice}
                      className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#007eff]/35 bg-[#071320] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#3398ff] hover:bg-[#0d1b2d] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Download className="mr-2 size-4" aria-hidden="true" />
                      {isDownloadingInvoice
                        ? tDashboard("order_journey_download_invoice_loading")
                        : tDashboard("order_journey_download_invoice")}
                    </button>
                  </article>
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<BookOpenText className="size-5" aria-hidden="true" />}
            title={tDashboard("overview_active_book_empty_title")}
            description={tDashboard("overview_active_book_empty_description")}
            ctaLabel={tDashboard("orders_empty_cta")}
            href="/pricing"
          />
        )}
      </section>

      <section
        aria-labelledby={recentOrdersTitleId}
        aria-describedby={recentOrdersDescriptionId}
        className={cn(SURFACE, SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_recent_orders_eyebrow")}
          title={tDashboard("overview_recent_orders_title")}
          description={tDashboard("overview_recent_orders_description")}
          titleId={recentOrdersTitleId}
          descriptionId={recentOrdersDescriptionId}
        />

        {recentOrders.length > 0 ? (
          <div className="mt-6 grid gap-3">
            {recentOrders.map((order) => (
              <RecentOrderCard
                key={order.id}
                order={order}
                locale={locale}
                tDashboard={tDashboard}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Receipt className="size-5" aria-hidden="true" />}
            title={tDashboard("orders_empty_title")}
            description={tDashboard("orders_empty_description")}
            ctaLabel={tDashboard("orders_empty_cta")}
            href="/pricing"
          />
        )}
      </section>

      <section
        aria-labelledby={notificationsTitleId}
        aria-describedby={notificationsDescriptionId}
        className={cn(SURFACE, SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_notifications_actions_eyebrow")}
          title={tDashboard("overview_notifications_actions_title")}
          description={tDashboard("overview_notifications_actions_description")}
          titleId={notificationsTitleId}
          descriptionId={notificationsDescriptionId}
        />

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric
            label={tDashboard("overview_notifications_metric")}
            value={String(notifications.unreadCount)}
            tone="accent"
          />
          <Metric
            label={tDashboard("overview_actions_metric")}
            value={String(pendingActions.total)}
          />
          <Metric
            label={tDashboard("overview_delay_metric")}
            value={
              notifications.hasProductionDelayBanner
                ? tDashboard("overview_delay_notice_active")
                : tDashboard("overview_delay_notice_idle")
            }
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className={cn(SUB_SURFACE, "p-4 md:p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_activity_feed_eyebrow")}</p>
                <h3 className="font-display mt-4 text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
                  {tDashboard("overview_activity_feed_title")}
                </h3>
                <p className="mt-3 max-w-[30rem] font-serif text-base leading-7 text-[#B8B8B8]">
                  {tDashboard("overview_activity_feed_description")}
                </p>
              </div>
            </div>

            {notificationsFeed.isInitialLoading ? (
              <div className="mt-5 grid gap-3">
                {["activity-skeleton-1", "activity-skeleton-2", "activity-skeleton-3"].map(
                  (key) => (
                    <NotificationItemSkeleton
                      key={key}
                      className="rounded-[22px] border-white/10 bg-[#09090B]"
                    />
                  )
                )}
              </div>
            ) : notificationsFeed.isError ? (
              <DashboardErrorState
                className="mt-5 min-h-[220px] rounded-[22px]"
                title={tDashboard("overview_activity_feed_title")}
                description={tDashboard("notifications_unavailable")}
                retryLabel={tCommon("retry")}
                loadingLabel={tCommon("loading")}
                onRetry={() => {
                  void notificationsFeed.refetch();
                }}
                isRetrying={notificationsFeed.isFetching}
              />
            ) : recentActivityItems.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {recentActivityItems.map((item) => {
                  const Icon = getNotificationFeedIcon(item.type);
                  const href = resolveNotificationFeedHref(item);
                  const title = translateNotificationCopy(t, item.data.titleKey, item.data.params);
                  const message = translateNotificationCopy(
                    t,
                    item.data.messageKey,
                    item.data.params
                  );
                  const timestamp = formatNotificationTimestamp(item.createdAt, locale);
                  const isWarning =
                    item.type === "PRODUCTION_DELAY" || item.data.presentation?.tone === "warning";
                  const itemClassName = cn(
                    "group relative overflow-hidden rounded-[22px] border px-4 py-4 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
                    isWarning
                      ? "border-[#FDE68A] bg-[#FEF3C7] text-[#141414]"
                      : "border-white/10 bg-[#09090B] text-white hover:-translate-y-0.5 hover:border-[#007eff]/35 hover:bg-[#10161F]"
                  );

                  const content = (
                    <>
                      {!item.isRead ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-4 left-0 w-1 rounded-full bg-[#007eff]"
                        />
                      ) : null}
                      <div className="relative flex items-start gap-3">
                        <span
                          className={cn(
                            "inline-flex size-10 shrink-0 items-center justify-center rounded-full border",
                            isWarning
                              ? "border-[#F59E0B]/50 bg-[#FFF7DA] text-[#92400E]"
                              : "border-[#2A2A2A] bg-black text-[#007eff]"
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "font-sans text-sm font-semibold",
                                  isWarning ? "text-[#141414]" : "text-white"
                                )}
                              >
                                {title}
                              </p>
                              <p
                                className={cn(
                                  "mt-1 text-sm leading-6",
                                  isWarning ? "text-[#3A3121]" : "text-[#BDBDBD]"
                                )}
                              >
                                {message}
                              </p>
                              {timestamp ? (
                                <p
                                  className={cn(
                                    "mt-2 font-sans text-[11px] font-medium tracking-[0.02em]",
                                    isWarning ? "text-[#614A12]" : "text-[#7C7C7C]"
                                  )}
                                >
                                  {timestamp}
                                </p>
                              ) : null}
                            </div>
                            {href ? (
                              <ArrowRight
                                className={cn(
                                  "mt-0.5 size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5",
                                  isWarning ? "text-[#7C5608]" : "text-[#9FD0FF]"
                                )}
                                aria-hidden="true"
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </>
                  );

                  return href ? (
                    <Link
                      key={item.id}
                      href={href}
                      aria-label={`${title}. ${message}`}
                      className={itemClassName}
                    >
                      {content}
                    </Link>
                  ) : (
                    <article key={item.id} className={itemClassName}>
                      {content}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-white/10 bg-[#09090B] px-4 py-4">
                <p className="font-sans text-sm text-[#B8B8B8]">
                  {tDashboard("overview_activity_feed_empty")}
                </p>
              </div>
            )}
          </div>

          <div className={cn(SUB_SURFACE, "p-4 md:p-5")}>
            <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_action_queue_eyebrow")}</p>
            <h3 className="font-display mt-4 text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
              {tDashboard("overview_action_queue_title")}
            </h3>
            <p className="mt-3 max-w-[30rem] font-serif text-base leading-7 text-[#B8B8B8]">
              {tDashboard("overview_action_queue_description")}
            </p>

            {pendingActions.items.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {pendingActions.items.map((action) => {
                  const actionTitle =
                    action.type === "UPLOAD_MANUSCRIPT"
                      ? tDashboard("overview_action_upload_title")
                      : action.type === "REVIEW_PREVIEW"
                        ? tDashboard("overview_action_review_preview_title")
                        : action.type === "PAY_EXTRA_PAGES"
                          ? tDashboard("overview_action_pay_extra_title")
                          : action.type === "COMPLETE_PROFILE"
                            ? tDashboard("overview_action_complete_profile_title")
                            : action.type === "REVIEW_BOOK"
                              ? tDashboard("overview_action_review_book_title")
                              : action.type === "RESOLVE_MANUSCRIPT_ISSUE"
                                ? tDashboard("overview_action_resolve_issue_title")
                                : action.type === "REPRINT_AVAILABLE"
                                  ? tDashboard("overview_action_reprint_title")
                                  : tDashboard("overview_next_action_idle_title");
                  const actionDescription =
                    action.type === "UPLOAD_MANUSCRIPT"
                      ? tDashboard("overview_action_upload_description")
                      : action.type === "REVIEW_PREVIEW"
                        ? tDashboard("overview_action_review_preview_description")
                        : action.type === "PAY_EXTRA_PAGES"
                          ? tDashboard("overview_action_pay_extra_description")
                          : action.type === "COMPLETE_PROFILE"
                            ? tDashboard("overview_action_complete_profile_description")
                            : action.type === "REVIEW_BOOK"
                              ? tDashboard("overview_action_review_book_description")
                              : action.type === "RESOLVE_MANUSCRIPT_ISSUE"
                                ? tDashboard("overview_action_resolve_issue_description")
                                : action.type === "REPRINT_AVAILABLE"
                                  ? tDashboard("overview_action_reprint_description")
                                  : tDashboard("overview_next_action_idle_description");

                  return (
                    <Link
                      key={`${action.type}-${action.href}`}
                      href={action.href}
                      aria-label={
                        action.bookTitle ? `${actionTitle}: ${action.bookTitle}` : actionTitle
                      }
                      className={cn(
                        SUB_SURFACE,
                        "group min-h-11 px-4 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#007eff] hover:bg-[#10161f] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                      )}
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-[#007eff] via-[#007eff]/40 to-transparent"
                      />
                      <div className="relative flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-sans text-sm font-semibold text-white">
                            {actionTitle}
                          </p>
                          <p className="mt-1 font-sans text-xs leading-5 text-[#9A9A9A]">
                            {action.bookTitle ?? actionDescription}
                          </p>
                        </div>
                        <ArrowRight
                          className="size-4 shrink-0 text-[#9FD0FF] transition-transform duration-150 group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className={cn(SUB_SURFACE, "mt-5 px-4 py-4")}>
                <p className="font-sans text-sm text-[#B8B8B8]">
                  {tDashboard("overview_notifications_no_actions")}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby={profileTitleId}
        aria-describedby={profileDescriptionId}
        className={cn(SURFACE, SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_profile_card_eyebrow")}
          title={tDashboard("overview_profile_card_title")}
          description={tDashboard("overview_profile_card_description")}
          titleId={profileTitleId}
          descriptionId={profileDescriptionId}
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.66fr)]">
          <div className={cn(SUB_SURFACE, "p-4 md:p-5")}>
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF] shadow-[0_10px_28px_rgba(0,126,255,0.14)]"
              >
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                  {profile.isProfileComplete
                    ? tDashboard("profile_complete_status")
                    : tDashboard("profile_incomplete_status")}
                </p>
                <h3 className="font-display mt-3 max-w-[12ch] text-[2.3rem] leading-[0.95] font-semibold tracking-[-0.05em] text-white">
                  {profile.isProfileComplete
                    ? tDashboard("overview_profile_complete_title")
                    : tDashboard("overview_profile_incomplete_title")}
                </h3>
                <p className="mt-4 max-w-[30rem] font-serif text-base leading-7 text-[#B8B8B8]">
                  {profile.isProfileComplete
                    ? tDashboard("overview_profile_complete_body")
                    : tDashboard("overview_profile_incomplete_body")}
                </p>
              </div>
            </div>
          </div>

          <div className={cn(SUB_SURFACE, "flex flex-col justify-between bg-[#08111C] p-4 md:p-5")}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#007eff]/0 via-[#007eff]/60 to-[#007eff]/0"
            />
            <div>
              <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_profile_cta_eyebrow")}</p>
              <p className="mt-4 font-serif text-base leading-7 text-[#D0D7E2]">
                {profile.isProfileComplete
                  ? tDashboard("overview_profile_cta_manage")
                  : tDashboard("complete_profile_banner")}
              </p>
            </div>
            <div className="mt-6">
              <Button asChild className={PRIMARY_BUTTON_CLASS}>
                <Link href="/dashboard/profile">
                  {profile.isProfileComplete
                    ? tDashboard("overview_profile_manage_cta")
                    : tDashboard("complete_profile_cta")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby={reprintReadyTitleId}
        aria-describedby={reprintReadyDescriptionId}
        className={cn(SURFACE, SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_reprint_ready_eyebrow")}
          title={tDashboard("overview_reprint_ready_title")}
          description={tDashboard("overview_reprint_ready_description")}
          titleId={reprintReadyTitleId}
          descriptionId={reprintReadyDescriptionId}
        />

        {reprintReadyOrders.length > 0 ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {reprintReadyOrders.map((order) => {
              if (!order.book?.id) {
                return null;
              }

              return (
                <article
                  key={order.id}
                  className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0C0C0E] p-4 md:p-5"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(0,126,255,0.08) 0%, rgba(0,0,0,0) 34%), radial-gradient(60% 46% at 100% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 72%)",
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                          {order.orderNumber}
                        </p>
                        <h3 className="font-display mt-3 max-w-[12ch] text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
                          {order.package.name ?? tDashboard("orders_unknown_package")}
                        </h3>
                      </div>
                      <span className="font-sans inline-flex min-h-8 items-center rounded-full border border-[#007eff]/30 bg-[#0B1A2A] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#CBE4FF]">
                        {tDashboard("overview_reprint_ready_badge")}
                      </span>
                    </div>
                    <p className="mt-4 font-serif text-base leading-7 text-[#B8B8B8]">
                      {formatDashboardDate(order.createdAt, locale) ??
                        tDashboard("orders_unknown_date")}
                    </p>
                    <div className="mt-5 flex flex-col gap-3">
                      <Button
                        className={PRIMARY_BUTTON_CLASS}
                        onClick={() => {
                          if (order.book?.id) setReprintModalBookId(order.book.id);
                        }}
                      >
                        {tDashboard("reprint_same")}
                      </Button>
                      <Button asChild className={SECONDARY_BUTTON_CLASS}>
                        <Link href={buildReviseReprintHref(order.book.id)}>
                          {tDashboard("revise_reprint")}
                        </Link>
                      </Button>
                      <Link
                        href={order.trackingUrl}
                        className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                      >
                        {tDashboard("orders_action_track")}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={cn(SUB_SURFACE, "mt-6 px-4 py-4 md:px-5")}>
            <p className="font-serif text-base leading-7 text-[#B8B8B8]">
              {tDashboard("overview_reprint_ready_empty")}
            </p>
            <div className="mt-4">
              <Link
                href="/dashboard/orders"
                className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                {tDashboard("overview_reprint_ready_open_orders")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </section>

      <section
        aria-labelledby={quickLinksTitleId}
        aria-describedby={quickLinksDescriptionId}
        className={cn("min-w-0 space-y-4", SECTION_REVEAL_CLASS, BELOW_FOLD_SECTION_CLASS)}
      >
        <SectionHeading
          eyebrow={tDashboard("overview_quick_links_eyebrow")}
          title={tDashboard("overview_quick_links_title")}
          description={tDashboard("overview_quick_links_description")}
          titleId={quickLinksTitleId}
          descriptionId={quickLinksDescriptionId}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-2">
            <QuickLinkCard
              href="/dashboard/books"
              title={tDashboard("my_books")}
              description={tDashboard("overview_quick_books_description")}
              icon={<BookOpenText className="size-5" aria-hidden="true" />}
              cta={tDashboard("overview_quick_open")}
              tone="blue"
              ariaLabel={`${tDashboard("my_books")}. ${tDashboard("overview_quick_books_description")}`}
            />
            <QuickLinkCard
              href="/dashboard/orders"
              title={tDashboard("orders")}
              description={tDashboard("overview_quick_orders_description")}
              icon={<Receipt className="size-5" aria-hidden="true" />}
              cta={tDashboard("overview_quick_open")}
              tone="steel"
              ariaLabel={`${tDashboard("orders")}. ${tDashboard("overview_quick_orders_description")}`}
            />
            <QuickLinkCard
              href="/dashboard/profile"
              title={tDashboard("profile")}
              description={tDashboard("overview_quick_profile_description")}
              icon={<UserRound className="size-5" aria-hidden="true" />}
              cta={tDashboard("overview_quick_open")}
              tone="ink"
              ariaLabel={`${tDashboard("profile")}. ${tDashboard("overview_quick_profile_description")}`}
            />
            <QuickLinkCard
              href="/dashboard/reviews"
              title={tDashboard("reviews")}
              description={tDashboard("overview_quick_reviews_description")}
              icon={<MessageSquareText className="size-5" aria-hidden="true" />}
              cta={tDashboard("overview_quick_open")}
              tone="night"
              ariaLabel={`${tDashboard("reviews")}. ${tDashboard("overview_quick_reviews_description")}`}
            />
          </div>

          <aside className={cn(SURFACE, "p-4 md:p-5")}>
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF] shadow-[0_10px_28px_rgba(0,126,255,0.14)]"
              >
                <LifeBuoy className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_support_eyebrow")}</p>
                <h3 className="font-display mt-4 text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
                  {tDashboard("overview_support_title")}
                </h3>
                <p className="mt-3 font-serif text-base leading-7 text-[#B8B8B8]">
                  {tDashboard("overview_support_description")}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[22px] border border-white/10 bg-[#09090B] p-4">
              <p className="font-sans text-sm leading-6 text-[#D0D0D0]">
                {tDashboard("order_tracking_support_sla")}
              </p>
              <p className="font-sans text-sm leading-6 text-[#B8B8B8]">
                {tDashboard("order_tracking_terms_notice")}
              </p>
              <p className="font-sans text-sm leading-6 text-[#B8B8B8]">
                {tDashboard("order_tracking_refund_policy_text")}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                {tDashboard("order_journey_contact_support")}
              </a>
              <Button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => setIsRefundPolicyOpen(true)}
              >
                {tDashboard("order_tracking_refund_policy_link")}
              </Button>
            </div>
          </aside>
        </div>
        <DashboardRefundPolicyDialog
          open={isRefundPolicyOpen}
          onOpenChange={setIsRefundPolicyOpen}
        />
        <ReprintSameModal
          open={isReprintModalOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setReprintModalBookId(null);
          }}
          config={reprintConfig.config}
          isLoading={reprintConfig.isInitialLoading}
          isError={reprintConfig.isError}
          errorMessage={reprintConfig.error?.message}
          onRetry={() => {
            void reprintConfig.refetch();
          }}
          bookTitle={reprintModalBookTitle}
        />
      </section>
    </div>
  );
}
