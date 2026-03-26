"use client";

import { ArrowLeft, CircleDollarSign, Copy, LifeBuoy, Receipt, Share2, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentType, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardErrorState } from "@/components/dashboard/dashboard-async-primitives";
import { DashboardRefundPolicyDialog } from "@/components/dashboard/dashboard-refund-policy-dialog";
import {
  type OrderJourneyStep,
  type OrderJourneyStepKey,
  type OrderJourneyStepState,
  OrderJourneyTracker,
} from "@/components/dashboard/order-journey-tracker";
import { ReprintSameModal } from "@/components/dashboard/reprint-same-modal";
import { Button } from "@/components/ui/button";
import { useBookReprintConfig } from "@/hooks/use-book-reprint-config";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useOrderTracking } from "@/hooks/useOrderTracking";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type OrderTrackingViewProps = {
  orderId: string;
};

const ORDER_ISSUE_STATUSES = new Set(["ACTION_REQUIRED", "CANCELLED", "REFUNDED"]);
const BOOK_ISSUE_STATUSES = new Set(["REJECTED", "CANCELLED"]);
const ORDER_DELIVERED_STATUSES = new Set(["COMPLETED"]);
const BOOK_DELIVERED_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

const ORDER_PRODUCTION_STATUSES = new Set([
  "PROCESSING",
  "FORMATTING",
  "PREVIEW_READY",
  "APPROVED",
  "IN_PRODUCTION",
]);
const BOOK_PRODUCTION_STATUSES = new Set([
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
]);

const ORDER_PAID_STATUSES = new Set([
  "PAID",
  "PROCESSING",
  "FORMATTING",
  "PREVIEW_READY",
  "APPROVED",
  "IN_PRODUCTION",
  "COMPLETED",
]);
const ORDER_REPRINT_BOOK_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

const JOURNEY_STEPS: OrderJourneyStepKey[] = [
  "ORDER_CREATED",
  "PAYMENT_CONFIRMED",
  "IN_PRODUCTION",
  "SHIPPED",
  "DELIVERED",
];

function getApiV1BaseUrl() {
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function normalizeStatus(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.replace(/[\s-]+/g, "_").toUpperCase();
}

function toStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toLocaleTag(locale: string): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-NG";
}

function resolveReprintInlineMessageKey(disableReason: string | null | undefined): string {
  switch (disableReason) {
    case "FINAL_PDF_MISSING":
      return "reprint_same_unavailable_inline_final_pdf";
    default:
      return "reprint_same_unavailable_inline_generic";
  }
}

function formatCurrency(
  amount: number | null,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;
  const currencyCode = (currency || "NGN").toUpperCase();

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

function formatDate(
  value: string | null,
  locale: string,
  fallback: string,
  options: Intl.DateTimeFormatOptions
): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(toLocaleTag(locale), options).format(parsed);
}

function resolveJourneyCurrentIndex(orderStatus: string | null, bookStatus: string | null): number {
  if (
    (bookStatus && BOOK_DELIVERED_STATUSES.has(bookStatus)) ||
    (orderStatus && ORDER_DELIVERED_STATUSES.has(orderStatus))
  ) {
    return 4;
  }

  if (bookStatus === "SHIPPING") {
    return 3;
  }

  if (
    (bookStatus && BOOK_PRODUCTION_STATUSES.has(bookStatus)) ||
    (orderStatus && ORDER_PRODUCTION_STATUSES.has(orderStatus))
  ) {
    return 2;
  }

  if (
    (orderStatus && ORDER_PAID_STATUSES.has(orderStatus)) ||
    (bookStatus && bookStatus !== "AWAITING_UPLOAD" && bookStatus !== "UPLOADED")
  ) {
    return 1;
  }

  return 0;
}

function resolveJourneySteps(params: {
  orderStatus: string | null;
  bookStatus: string | null;
  orderCreatedAt: string | null;
  paymentAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  tDashboard: (key: string) => string;
}): OrderJourneyStep[] {
  const currentIndex = resolveJourneyCurrentIndex(params.orderStatus, params.bookStatus);
  const isIssue =
    (params.orderStatus ? ORDER_ISSUE_STATUSES.has(params.orderStatus) : false) ||
    (params.bookStatus ? BOOK_ISSUE_STATUSES.has(params.bookStatus) : false);

  const stepLabels: Record<OrderJourneyStepKey, string> = {
    ORDER_CREATED: params.tDashboard("order_journey_stage_order_created"),
    PAYMENT_CONFIRMED: params.tDashboard("order_journey_stage_payment_confirmed"),
    IN_PRODUCTION: params.tDashboard("order_journey_stage_in_production"),
    SHIPPED: params.tDashboard("order_journey_stage_shipped"),
    DELIVERED: params.tDashboard("order_journey_stage_delivered"),
  };

  const reachedAtByStep: Record<OrderJourneyStepKey, string | null> = {
    ORDER_CREATED: params.orderCreatedAt,
    PAYMENT_CONFIRMED: params.paymentAt,
    IN_PRODUCTION: params.paymentAt,
    SHIPPED: params.shippedAt,
    DELIVERED: params.deliveredAt,
  };

  return JOURNEY_STEPS.map((stepKey, index) => {
    let state: OrderJourneyStepState = "upcoming";
    if (index < currentIndex) {
      state = "completed";
    } else if (index === currentIndex) {
      state = isIssue ? "issue" : "current";
    }

    return {
      key: stepKey,
      label: stepLabels[stepKey],
      state,
      reachedAt: reachedAtByStep[stepKey],
    };
  });
}

function resolveEtaLabel(
  currentStep: OrderJourneyStep | undefined,
  tDashboard: (key: string) => string
): string {
  if (!currentStep) return tDashboard("order_tracking_eta_pending");
  if (currentStep.key === "DELIVERED") return tDashboard("order_tracking_eta_delivered");
  if (currentStep.key === "SHIPPED") return tDashboard("order_tracking_eta_shipping");
  return tDashboard("order_tracking_eta_pending");
}

function resolveDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ? match[1] : fallback;
}

function OrderTrackingSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-6">
      <p className="font-sans text-xs text-[#bdbdbd]">{title}</p>
      <p className="font-sans mt-1 text-sm text-[#8f8f8f]">{description}</p>
      <div className="mt-5 h-32 animate-pulse rounded-2xl bg-[#2A2A2A]" />
    </section>
  );
}

function MetadataItem({
  label,
  value,
  icon,
  muted = false,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  muted?: boolean;
}) {
  const Icon = icon;
  return (
    <div className="min-w-0 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-3">
      <p className="font-sans flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
        <Icon className="size-3.5" aria-hidden={true} />
        {label}
      </p>
      <p
        title={value}
        className={cn(
          "font-sans mt-1 text-sm text-[#d9d9d9] break-words [overflow-wrap:anywhere]",
          muted ? "text-[#9d9d9d]" : null
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function OrderTrackingView({ orderId }: OrderTrackingViewProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isSharingJourney, setIsSharingJourney] = useState(false);
  const [isRefundPolicyOpen, setIsRefundPolicyOpen] = useState(false);
  const [isReprintSameModalOpen, setIsReprintSameModalOpen] = useState(false);
  const reprintSameTriggerRef = useRef<HTMLButtonElement | null>(null);

  const tracking = useOrderTracking({
    orderId,
    enabled: Boolean(orderId),
  });
  const orderDetail = useOrderDetail({
    orderId,
    enabled: Boolean(orderId),
  });

  const orderReference = tracking.orderNumber || tracking.orderId || orderId;
  const orderStatus = normalizeStatus(tracking.currentOrderStatus);
  const bookStatus = normalizeStatus(tracking.currentBookStatus);
  const canShowReprintActions =
    tracking.bookId !== null && bookStatus !== null && ORDER_REPRINT_BOOK_STATUSES.has(bookStatus);
  const {
    config: reprintConfig,
    isError: isReprintConfigError,
    isInitialLoading: isReprintConfigInitialLoading,
    refetch: refetchReprintConfig,
    error: reprintConfigError,
  } = useBookReprintConfig({
    bookId: tracking.bookId,
    enabled: canShowReprintActions,
  });

  const currentJourneySteps = useMemo(
    () =>
      resolveJourneySteps({
        orderStatus,
        bookStatus,
        orderCreatedAt: orderDetail.createdAt,
        paymentAt: orderDetail.latestPaymentCreatedAt ?? orderDetail.updatedAt,
        shippedAt:
          tracking.currentStage === "SHIPPING"
            ? (tracking.data.timeline.at(-1)?.reachedAt ?? null)
            : null,
        deliveredAt:
          tracking.currentStage === "DELIVERED"
            ? (tracking.data.timeline.at(-1)?.reachedAt ?? null)
            : null,
        tDashboard,
      }),
    [
      bookStatus,
      orderDetail.createdAt,
      orderDetail.latestPaymentCreatedAt,
      orderDetail.updatedAt,
      orderStatus,
      tDashboard,
      tracking.currentStage,
      tracking.data.timeline,
    ]
  );

  const activeStep = currentJourneySteps.find(
    (step) => step.state === "current" || step.state === "issue"
  );
  const localeTag = toLocaleTag(locale);
  const paymentStatusLabel =
    toStatusLabel(orderDetail.latestPaymentStatus) ??
    toStatusLabel(orderStatus) ??
    tDashboard("orders_unknown_status");
  const totalPaidLabel = formatCurrency(
    orderDetail.totalAmount,
    orderDetail.currency,
    localeTag,
    tDashboard("orders_unknown_total")
  );
  const shippingProviderLabel =
    tracking.shippingProvider ??
    orderDetail.shippingProvider ??
    tDashboard("order_tracking_shipping_unavailable");
  const trackingNumberLabel =
    tracking.trackingNumber ??
    orderDetail.trackingNumber ??
    tDashboard("order_tracking_number_unavailable");
  const paymentProviderLabel =
    toStatusLabel(orderDetail.latestPaymentProvider) ??
    tDashboard("order_tracking_payment_provider_unavailable");
  const paymentReferenceLabel =
    orderDetail.latestPaymentReference ??
    tDashboard("order_tracking_payment_reference_unavailable");
  const lastUpdatedLabel = formatDate(
    tracking.data.updatedAt ?? orderDetail.updatedAt,
    locale,
    tDashboard("order_tracking_last_updated_unavailable"),
    { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }
  );
  const reviseReprintHref = useMemo(() => {
    if (!tracking.bookId) return null;

    const params = new URLSearchParams({
      orderType: "REPRINT",
      sourceBookId: tracking.bookId,
    });

    return `/pricing?${params.toString()}`;
  }, [tracking.bookId]);
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

  const handleDownloadInvoice = useCallback(async () => {
    setIsDownloadingInvoice(true);
    try {
      const endpoint = `${API_V1_BASE_URL}/orders/${tracking.orderId || orderId}/invoice`;
      const requestInvoice = () =>
        fetch(endpoint, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

      const downloadFromResponse = async (response: Response) => {
        const fileName = resolveDownloadFileName(
          response.headers.get("content-disposition"),
          `bookprinta-invoice-${orderReference}.pdf`
        );
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = "noopener noreferrer";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      };

      const firstAttempt = await requestInvoice();
      if (firstAttempt.ok) {
        await downloadFromResponse(firstAttempt);
        toast.success(tDashboard("order_journey_invoice_ready"));
        return;
      }

      const archiveResponse = await fetch(
        `${API_V1_BASE_URL}/orders/${tracking.orderId || orderId}/invoice/archive`,
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
  }, [orderId, orderReference, tDashboard, tracking.orderId]);

  const handleCopyOrderReference = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(orderReference);
      toast.success(tDashboard("order_journey_ref_copied"));
    } catch {
      toast.error(tDashboard("order_journey_ref_copy_failed"));
    }
  }, [orderReference, tDashboard]);

  const handleShareJourney = useCallback(async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    setIsSharingJourney(true);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: tDashboard("order_journey_share_title"),
          text: tDashboard("order_journey_share_text", { reference: orderReference }),
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success(tDashboard("order_journey_share_copied"));
    } catch {
      toast.error(tDashboard("order_journey_share_failed"));
    } finally {
      setIsSharingJourney(false);
    }
  }, [orderReference, tDashboard]);

  if (tracking.isInitialLoading) {
    return (
      <OrderTrackingSkeleton
        title={tDashboard("order_tracking_loading_title")}
        description={tDashboard("order_tracking_loading_description")}
      />
    );
  }

  if (tracking.isError) {
    const errorMessage =
      tracking.error instanceof Error && tracking.error.message.trim().length > 0
        ? tracking.error.message
        : tDashboard("order_tracking_error_description");
    return (
      <DashboardErrorState
        className="rounded-[32px]"
        title={tDashboard("order_tracking_error_title")}
        description={errorMessage}
        retryLabel={tCommon("retry")}
        loadingLabel={tCommon("loading")}
        onRetry={() => {
          void tracking.refetch();
        }}
        isRetrying={tracking.isFetching}
      />
    );
  }

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <header className="space-y-1.5">
        <Link
          href="/dashboard/orders"
          className="font-sans inline-flex min-h-10 items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 md:min-h-11 md:px-4 md:text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {tDashboard("order_tracking_back_to_orders")}
        </Link>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tDashboard("order_journey_title")}
        </h1>
        <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
          {tDashboard("order_journey_subtitle")}
        </p>
        <p className="font-sans text-xs text-[#bdbdbd] md:text-sm">
          {tDashboard("order_tracking_ref", { reference: orderReference })}
        </p>
        <p className="font-sans text-xs text-[#9d9d9d] md:text-sm">
          {tDashboard("order_tracking_last_updated", { updatedAt: lastUpdatedLabel })}
        </p>
      </header>

      <OrderJourneyTracker
        steps={currentJourneySteps}
        locale={locale}
        ariaLabel={tDashboard("order_journey_aria")}
      />

      <section className="grid gap-3 rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:grid-cols-2 lg:grid-cols-6">
        <MetadataItem
          label={tDashboard("order_tracking_payment_status")}
          value={paymentStatusLabel}
          icon={CircleDollarSign}
        />
        <MetadataItem
          label={tDashboard("order_tracking_total_paid")}
          value={totalPaidLabel}
          icon={Receipt}
        />
        <MetadataItem
          label={tDashboard("order_tracking_payment_provider")}
          value={paymentProviderLabel}
          icon={CircleDollarSign}
          muted={paymentProviderLabel === tDashboard("order_tracking_payment_provider_unavailable")}
        />
        <MetadataItem
          label={tDashboard("order_tracking_payment_reference")}
          value={paymentReferenceLabel}
          icon={Receipt}
          muted={
            paymentReferenceLabel === tDashboard("order_tracking_payment_reference_unavailable")
          }
        />
        <MetadataItem
          label={tDashboard("order_tracking_number")}
          value={trackingNumberLabel}
          icon={Truck}
          muted={trackingNumberLabel === tDashboard("order_tracking_number_unavailable")}
        />
        <MetadataItem
          label={tDashboard("order_tracking_eta")}
          value={resolveEtaLabel(activeStep, tDashboard)}
          icon={Truck}
        />
        <MetadataItem
          label={tDashboard("order_tracking_shipping_provider")}
          value={shippingProviderLabel}
          icon={Truck}
          muted={shippingProviderLabel === tDashboard("order_tracking_shipping_unavailable")}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownloadInvoice}
          disabled={isDownloadingInvoice}
          className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          {isDownloadingInvoice
            ? tDashboard("order_journey_download_invoice_loading")
            : tDashboard("order_journey_download_invoice")}
        </button>
        {canShowReprintActions ? (
          <Button
            ref={reprintSameTriggerRef}
            type="button"
            variant="outline"
            onClick={() => setIsReprintSameModalOpen(true)}
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
        <button
          type="button"
          onClick={handleShareJourney}
          disabled={isSharingJourney}
          className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <Share2 className="mr-2 size-4" aria-hidden="true" />
          {tDashboard("order_journey_share")}
        </button>
        <button
          type="button"
          onClick={handleCopyOrderReference}
          className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <Copy className="mr-2 size-4" aria-hidden="true" />
          {tDashboard("order_journey_copy_ref")}
        </button>
        <a
          href="https://wa.me/2348103208297"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <LifeBuoy className="mr-2 size-4" aria-hidden="true" />
          {tDashboard("order_journey_contact_support")}
        </a>
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

      <section className="space-y-2 rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4">
        <h2 className="font-display text-lg font-semibold text-white">
          {tDashboard("order_tracking_compliance_title")}
        </h2>
        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("order_tracking_support_sla")}
        </p>
        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("order_tracking_terms_notice")}
        </p>
        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("order_tracking_refund_policy_text")}{" "}
          <button
            type="button"
            onClick={() => setIsRefundPolicyOpen(true)}
            className="text-[#66adff] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#66adff] focus-visible:outline-offset-2"
          >
            {tDashboard("order_tracking_refund_policy_link")}
          </button>
        </p>
      </section>

      <DashboardRefundPolicyDialog open={isRefundPolicyOpen} onOpenChange={setIsRefundPolicyOpen} />

      <ReprintSameModal
        open={isReprintSameModalOpen}
        onOpenChange={setIsReprintSameModalOpen}
        bookTitle={tracking.title ?? null}
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
