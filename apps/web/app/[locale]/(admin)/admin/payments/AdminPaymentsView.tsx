"use client";

import type { PendingBankTransferSlaState } from "@bookprinta/shared";
import {
  AlertCircle,
  Clock3,
  Mail,
  Phone,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminPaymentRejectActionState,
  useAdminApproveBankTransferMutation,
  useAdminRejectBankTransferMutation,
} from "@/hooks/useAdminPaymentActions";
import {
  type PendingBankTransferWithLiveSla,
  usePendingBankTransfers,
} from "@/hooks/useAdminPayments";
import { cn } from "@/lib/utils";
import { AllPaymentsSection } from "./AllPaymentsSection";
import type { PaymentReceiptPreviewTarget } from "./PaymentReceiptLightbox";

const LazyPaymentReceiptLightbox = lazy(async () => {
  const module = await import("./PaymentReceiptLightbox");
  return { default: module.PaymentReceiptLightbox };
});

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const PENDING_TRANSFER_CARD_SKELETON_KEYS = [
  "pending-transfer-card-1",
  "pending-transfer-card-2",
  "pending-transfer-card-3",
] as const;

const PENDING_TRANSFER_ROW_SKELETON_KEYS = [
  "pending-transfer-row-1",
  "pending-transfer-row-2",
  "pending-transfer-row-3",
  "pending-transfer-row-4",
] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatAdminDateTime(
  value: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatAdminCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return fallback;
  }

  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: (currency || "NGN").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return fallback;
  }
}

function getTimerTextClass(state: PendingBankTransferSlaState): string {
  if (state === "green") return "text-[#22C55E]";
  if (state === "yellow") return "text-[#EAB308]";
  return "text-[#EF4444]";
}

function getSurfaceClass(isOverdue: boolean): string {
  return isOverdue
    ? "border-[#4A1D22] bg-[linear-gradient(180deg,rgba(239,68,68,0.08)_0%,rgba(11,11,11,1)_100%)]"
    : "border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)]";
}

function getReceiptButtonClass(hasReceipt: boolean): string {
  return cn(
    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 font-sans text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
    hasReceipt
      ? "border-[#2A2A2A] bg-[#090909] text-white hover:border-[#007eff] hover:bg-[#101010]"
      : "border-[#1A1A1A] bg-[#090909] text-[#666666]"
  );
}

function resolvePendingTransferPayerName(
  item: PendingBankTransferWithLiveSla,
  fallback: string
): string {
  return item.payerName || item.customer.fullName || fallback;
}

function buildReceiptPreviewTarget(params: {
  receiptUrl: string;
  payerName: string;
  orderReference: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  createdAt: string | null | undefined;
  locale: string;
  amountFallback: string;
  dateFallback: string;
}): PaymentReceiptPreviewTarget {
  return {
    receiptUrl: params.receiptUrl,
    payerName: params.payerName,
    orderReference: params.orderReference,
    amountLabel: formatAdminCurrency(
      params.amount,
      params.currency,
      params.locale,
      params.amountFallback
    ),
    receivedAtLabel: formatAdminDateTime(params.createdAt, params.locale, params.dateFallback),
  };
}

function PendingTransferReceiptAction({
  item,
  locale,
  onViewReceipt,
}: {
  item: PendingBankTransferWithLiveSla;
  locale: string;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
}) {
  const tAdmin = useTranslations("admin");

  if (!item.receiptUrl) {
    return (
      <span className={getReceiptButtonClass(false)}>
        {tAdmin("payments_pending_receipt_missing")}
      </span>
    );
  }

  const receiptUrl = item.receiptUrl;

  return (
    <button
      type="button"
      onClick={() =>
        onViewReceipt(
          buildReceiptPreviewTarget({
            receiptUrl,
            payerName: resolvePendingTransferPayerName(
              item,
              tAdmin("payments_pending_payer_unknown")
            ),
            orderReference: item.orderReference,
            amount: item.amount,
            currency: item.currency,
            createdAt: item.createdAt,
            locale,
            amountFallback: tAdmin("payments_total_unavailable"),
            dateFallback: tAdmin("payments_date_unavailable"),
          })
        )
      }
      className={getReceiptButtonClass(true)}
      aria-label={tAdmin("payments_pending_receipt_action")}
      aria-haspopup="dialog"
    >
      <ReceiptText className="size-4" aria-hidden="true" />
      <span>{tAdmin("payments_pending_receipt_action")}</span>
    </button>
  );
}

type PendingBankTransferRowProps = {
  item: PendingBankTransferWithLiveSla;
  locale: string;
  approveLoading: boolean;
  rejectLoading: boolean;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
  onApprove: (item: PendingBankTransferWithLiveSla) => void;
  onReject: (item: PendingBankTransferWithLiveSla) => void;
};

function PendingTransferCard({
  item,
  locale,
  approveLoading,
  rejectLoading,
  onViewReceipt,
  onApprove,
  onReject,
}: PendingBankTransferRowProps) {
  const tAdmin = useTranslations("admin");
  const payerName = resolvePendingTransferPayerName(item, tAdmin("payments_pending_payer_unknown"));
  const amount = formatAdminCurrency(
    item.amount,
    item.currency,
    locale,
    tAdmin("payments_total_unavailable")
  );
  const receivedAt = formatAdminDateTime(
    item.createdAt,
    locale,
    tAdmin("payments_date_unavailable")
  );

  return (
    <article
      className={cn(
        "rounded-[1.5rem] border p-4 shadow-[0_20px_55px_rgba(0,0,0,0.2)]",
        getSurfaceClass(item.liveSla.isOverdue)
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[11px] font-medium tracking-[0.24em] text-[#7D7D7D] uppercase">
            {tAdmin("payments_pending_waiting")}
          </p>
          <p
            className={cn(
              "font-sans mt-2 text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums",
              getTimerTextClass(item.liveSla.state)
            )}
          >
            <span className="sr-only">{item.liveSla.ariaLabel}</span>
            <span aria-hidden="true">{item.liveSla.label}</span>
          </p>
        </div>
        <span className="rounded-full border border-[#2A2A2A] bg-[#101010] px-3 py-1 font-sans text-[11px] font-medium text-[#D0D0D0]">
          {item.orderReference}
        </span>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="rounded-[1.25rem] border border-[#1A1A1A] bg-[#080808] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[#101010] text-[#007eff]">
              <UserRound className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-sans text-base font-semibold text-white">{payerName}</p>
              <p className="mt-1 font-sans text-sm text-[#B4B4B4]">
                {tAdmin("payments_pending_amount", { amount })}
              </p>
              <p className="mt-1 font-sans text-xs text-[#7D7D7D]">
                {tAdmin("payments_pending_received", { date: receivedAt })}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="flex items-start gap-2 text-sm text-[#CFCFCF]">
              <Mail className="mt-0.5 size-4 shrink-0 text-[#007eff]" aria-hidden="true" />
              <span className="min-w-0 break-all">
                {item.payerEmail || item.customer.email || tAdmin("payments_pending_email_missing")}
              </span>
            </div>
            <div className="flex items-start gap-2 text-sm text-[#CFCFCF]">
              <Phone className="mt-0.5 size-4 shrink-0 text-[#007eff]" aria-hidden="true" />
              <span>
                {item.payerPhone ||
                  item.customer.phoneNumber ||
                  tAdmin("payments_pending_phone_missing")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.25rem] border border-[#1A1A1A] bg-[#080808] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[#7D7D7D]">
              {tAdmin("payments_pending_table_receipt")}
            </p>
            <PendingTransferReceiptAction
              item={item}
              locale={locale}
              onViewReceipt={onViewReceipt}
            />
          </div>

          <div className="grid gap-2 font-sans text-sm text-[#B4B4B4]">
            <p>
              {tAdmin("payments_pending_provider_ref", {
                reference: item.providerRef || tAdmin("payments_pending_provider_ref_missing"),
              })}
            </p>
            <p>
              {tAdmin("payments_pending_email", {
                email: item.customer.email || tAdmin("payments_pending_email_missing"),
              })}
            </p>
            <p>
              {tAdmin("payments_pending_phone", {
                phone: item.customer.phoneNumber || tAdmin("payments_pending_phone_missing"),
              })}
            </p>
          </div>
        </div>

        {item.hasAdminNote && item.adminNote ? (
          <div className="rounded-[1.25rem] border border-[#4A3915] bg-[#171108] p-4">
            <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#EAB308]">
              {tAdmin("payments_pending_meta_admin_note")}
            </p>
            <p className="mt-2 font-sans text-sm leading-6 text-[#E9DFB0]">{item.adminNote}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => onApprove(item)}
            disabled={approveLoading || rejectLoading}
            className="min-h-12 rounded-full bg-[#007eff] font-sans text-sm font-bold text-white hover:bg-[#0069d9]"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>
              {approveLoading
                ? tAdmin("payments_pending_approve_loading")
                : tAdmin("payments_pending_approve_action")}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onReject(item)}
            disabled={approveLoading || rejectLoading}
            className="min-h-12 rounded-full border border-[#2A2A2A] bg-[#0A0A0A] font-sans text-sm font-semibold text-[#D5D5D5] hover:border-[#EF4444]/55 hover:bg-[#1A0C0E] hover:text-[#EF4444]"
          >
            <ShieldX className="size-4" aria-hidden="true" />
            <span>{tAdmin("payments_pending_reject_action")}</span>
          </Button>
        </div>
      </div>
    </article>
  );
}

function PendingTransferDesktopTable({
  items,
  locale,
  activeApprovalId,
  activeRejectId,
  onViewReceipt,
  onApprove,
  onReject,
}: {
  items: PendingBankTransferWithLiveSla[];
  locale: string;
  activeApprovalId: string | null;
  activeRejectId: string | null;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
  onApprove: (item: PendingBankTransferWithLiveSla) => void;
  onReject: (item: PendingBankTransferWithLiveSla) => void;
}) {
  const tAdmin = useTranslations("admin");

  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[1120px]">
      <Table>
        <TableHeader>
          <TableRow className="border-[#1D1D1D] bg-[#0A0A0A] hover:bg-[#0A0A0A]">
            <TableHead className="h-12 min-w-[15rem] px-4 font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_table_payer")}
            </TableHead>
            <TableHead className="h-12 min-w-[9rem] px-4 font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_table_amount")}
            </TableHead>
            <TableHead className="h-12 min-w-[8rem] px-4 font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_waiting")}
            </TableHead>
            <TableHead className="h-12 min-w-[12rem] px-4 font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_table_receipt")}
            </TableHead>
            <TableHead className="h-12 min-w-[16rem] px-4 font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_table_context")}
            </TableHead>
            <TableHead className="h-12 min-w-[16rem] px-4 text-right font-sans text-[11px] font-medium tracking-[0.12em] text-[#9A9A9A] uppercase">
              {tAdmin("payments_pending_table_actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const payerName = resolvePendingTransferPayerName(
              item,
              tAdmin("payments_pending_payer_unknown")
            );
            const amount = formatAdminCurrency(
              item.amount,
              item.currency,
              locale,
              tAdmin("payments_total_unavailable")
            );
            const receivedAt = formatAdminDateTime(
              item.createdAt,
              locale,
              tAdmin("payments_date_unavailable")
            );
            const isApproveLoading = activeApprovalId === item.id;
            const isRejectLoading = activeRejectId === item.id;

            return (
              <TableRow
                key={item.id}
                className={cn(
                  "border-[#1D1D1D] align-top hover:bg-[#101010]",
                  item.liveSla.isOverdue &&
                    "bg-[rgba(239,68,68,0.08)] hover:bg-[rgba(239,68,68,0.12)]"
                )}
              >
                <TableCell className="px-4 py-4 align-top">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-semibold text-white">{payerName}</p>
                    <p className="mt-1 font-sans text-sm text-[#B4B4B4]">
                      {item.customer.email || tAdmin("payments_pending_email_missing")}
                    </p>
                    <p className="mt-1 font-sans text-xs text-[#7D7D7D]">
                      {item.customer.phoneNumber || tAdmin("payments_pending_phone_missing")}
                    </p>
                    <p className="mt-2 font-sans text-xs text-[#7D7D7D]">{item.orderReference}</p>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <p className="font-sans text-sm font-semibold text-white">{amount}</p>
                  <p className="mt-1 font-sans text-xs text-[#7D7D7D]">{receivedAt}</p>
                </TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <div className="space-y-2">
                    <p
                      className={cn(
                        "font-sans text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums",
                        getTimerTextClass(item.liveSla.state)
                      )}
                    >
                      <span className="sr-only">{item.liveSla.ariaLabel}</span>
                      <span aria-hidden="true">{item.liveSla.label}</span>
                    </p>
                    <p className="font-sans text-xs text-[#7D7D7D]">
                      {tAdmin("payments_pending_waiting")}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <PendingTransferReceiptAction
                    item={item}
                    locale={locale}
                    onViewReceipt={onViewReceipt}
                  />
                </TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <div className="space-y-2 font-sans text-sm text-[#B4B4B4]">
                    <p>
                      {tAdmin("payments_pending_provider_ref", {
                        reference:
                          item.providerRef || tAdmin("payments_pending_provider_ref_missing"),
                      })}
                    </p>
                    {item.hasAdminNote && item.adminNote ? (
                      <div className="rounded-2xl border border-[#4A3915] bg-[#171108] px-3 py-2 text-[#E9DFB0]">
                        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[#EAB308]">
                          {tAdmin("payments_pending_meta_admin_note")}
                        </span>
                        <span className="mt-1 block leading-6">{item.adminNote}</span>
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4 align-top">
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      onClick={() => onApprove(item)}
                      disabled={isApproveLoading || isRejectLoading}
                      className="min-h-11 rounded-full bg-[#007eff] px-4 font-sans text-sm font-bold text-white hover:bg-[#0069d9]"
                    >
                      {isApproveLoading
                        ? tAdmin("payments_pending_approve_loading")
                        : tAdmin("payments_pending_approve_action")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onReject(item)}
                      disabled={isApproveLoading || isRejectLoading}
                      className="min-h-11 rounded-full border border-[#2A2A2A] bg-[#0A0A0A] px-4 font-sans text-sm font-semibold text-[#D5D5D5] hover:border-[#EF4444]/55 hover:bg-[#1A0C0E] hover:text-[#EF4444]"
                    >
                      {tAdmin("payments_pending_reject_action")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function PendingTransferSkeletons() {
  return (
    <DashboardResponsiveDataRegion
      mobileCards={PENDING_TRANSFER_CARD_SKELETON_KEYS.map((key) => (
        <div key={key} className="rounded-[1.5rem] border border-[#1D1D1D] bg-[#090909] p-4">
          <Skeleton className="h-4 w-24 bg-[#171717]" />
          <Skeleton className="mt-3 h-12 w-28 bg-[#171717]" />
          <Skeleton className="mt-5 h-32 rounded-[1.25rem] bg-[#121212]" />
          <Skeleton className="mt-4 h-24 rounded-[1.25rem] bg-[#121212]" />
          <Skeleton className="mt-4 h-12 rounded-full bg-[#121212]" />
        </div>
      ))}
      desktopTable={
        <DashboardTableViewport minWidthClassName="md:min-w-[1120px]">
          <div className="space-y-3 p-4">
            {PENDING_TRANSFER_ROW_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-20 rounded-[1rem] bg-[#121212]" />
            ))}
          </div>
        </DashboardTableViewport>
      }
    />
  );
}

export function AdminPaymentsView() {
  const locale = useLocale();
  const tAdmin = useTranslations("admin");
  const pendingTransfers = usePendingBankTransfers();
  const approveMutation = useAdminApproveBankTransferMutation();
  const rejectMutation = useAdminRejectBankTransferMutation();

  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<PaymentReceiptPreviewTarget | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingBankTransferWithLiveSla | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);

  const rejectActionState = useMemo(
    () => getAdminPaymentRejectActionState(rejectReason),
    [rejectReason]
  );

  const refreshedLabel = formatAdminDateTime(
    pendingTransfers.refreshedAt,
    locale,
    tAdmin("payments_date_unavailable")
  );

  const resetRejectDialog = () => {
    setRejectTarget(null);
    setRejectReason("");
    setActiveRejectId(null);
  };

  const closeRejectDialog = () => {
    if (rejectMutation.isPending) return;
    resetRejectDialog();
  };

  const closeReceiptPreview = () => {
    setReceiptPreview(null);
  };

  const handleApprove = async (item: PendingBankTransferWithLiveSla) => {
    setActiveApprovalId(item.id);

    try {
      await approveMutation.mutateAsync({
        paymentId: item.id,
        orderId: item.orderId,
      });

      toast.success(tAdmin("payments_pending_toast_approved_title"), {
        description: tAdmin("payments_pending_toast_approved_description"),
      });
    } catch (error) {
      toast.error(tAdmin("payments_pending_toast_error_title"), {
        description:
          error instanceof Error ? error.message : tAdmin("payments_pending_error_description"),
      });
    } finally {
      setActiveApprovalId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !rejectActionState.canSubmit) {
      return;
    }

    setActiveRejectId(rejectTarget.id);

    try {
      await rejectMutation.mutateAsync({
        paymentId: rejectTarget.id,
        orderId: rejectTarget.orderId,
        adminNote: rejectActionState.normalizedReason,
      });

      toast.success(tAdmin("payments_pending_toast_rejected_title"), {
        description: tAdmin("payments_pending_toast_rejected_description"),
      });
      resetRejectDialog();
    } catch (error) {
      toast.error(tAdmin("payments_pending_toast_error_title"), {
        description:
          error instanceof Error ? error.message : tAdmin("payments_pending_error_description"),
      });
      setActiveRejectId(null);
    }
  };

  return (
    <>
      <div className="space-y-6 pb-8 md:space-y-8 md:pb-10">
        <section className="rounded-[1.75rem] border border-[#1D1D1D] bg-[radial-gradient(circle_at_top_left,rgba(0,126,255,0.18),transparent_38%),linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-5 md:p-6">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("payments_pending_eyebrow")}
          </p>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">
            {tAdmin("payments_pending_title")}
          </h1>
          <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("payments_workspace_description")}
          </p>
          <p className="font-sans mt-4 text-sm text-[#D8D8D8]">
            {tAdmin("payments_pending_description")}
          </p>
        </section>

        <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="font-sans text-xs font-medium uppercase tracking-[0.24em] text-[#7D7D7D]">
                {tAdmin("payments_pending_summary_label")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex min-h-9 items-center rounded-full border border-[#007eff]/35 bg-[#007eff]/12 px-3 font-sans text-xs font-medium text-[#B9DAFF]">
                  {tAdmin("payments_pending_summary_total", {
                    count: pendingTransfers.totalItems,
                  })}
                </span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-[#2A2A2A] bg-[#101010] px-3 font-sans text-xs text-[#CFCFCF]">
                  <Clock3 className="mr-2 size-3.5 text-[#007eff]" aria-hidden="true" />
                  {tAdmin("payments_pending_sorting_hint")}
                </span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-[#2A2A2A] bg-[#101010] px-3 font-sans text-xs text-[#CFCFCF]">
                  <RefreshCw className="mr-2 size-3.5 text-[#007eff]" aria-hidden="true" />
                  {tAdmin("payments_pending_summary_refreshed", {
                    date: refreshedLabel,
                  })}
                </span>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-[#1E334E] bg-[#06101C] p-4 lg:max-w-md">
              <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#83BFFF]">
                {tAdmin("payments_pending_summary_notice")}
              </p>
            </div>
          </div>

          <div className="mt-5">
            {pendingTransfers.isInitialLoading ? <PendingTransferSkeletons /> : null}

            {!pendingTransfers.isInitialLoading &&
            pendingTransfers.isError &&
            pendingTransfers.items.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[#4A1D22] bg-[#14090B] p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="mt-0.5 size-5 shrink-0 text-[#EF4444]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold text-white">
                      {tAdmin("payments_pending_error_title")}
                    </h2>
                    <p className="font-sans mt-2 text-sm leading-6 text-[#D7B8BD]">
                      {tAdmin("payments_pending_error_description")}
                    </p>
                    <Button
                      type="button"
                      onClick={() => void pendingTransfers.refetch()}
                      className="mt-4 min-h-11 rounded-full bg-[#007eff] px-4 font-sans text-sm font-bold text-white hover:bg-[#0069d9]"
                    >
                      {tAdmin("payments_pending_retry")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {!pendingTransfers.isInitialLoading &&
            !pendingTransfers.isError &&
            pendingTransfers.items.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[#1D1D1D] bg-[#090909] p-6 text-center">
                <h2 className="font-display text-2xl font-semibold text-white">
                  {tAdmin("payments_pending_empty_title")}
                </h2>
                <p className="font-sans mx-auto mt-3 max-w-xl text-sm leading-6 text-[#B4B4B4]">
                  {tAdmin("payments_pending_empty_description")}
                </p>
              </div>
            ) : null}

            {!pendingTransfers.isInitialLoading && pendingTransfers.items.length > 0 ? (
              <DashboardResponsiveDataRegion
                mobileCards={pendingTransfers.items.map((item) => (
                  <PendingTransferCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    approveLoading={activeApprovalId === item.id}
                    rejectLoading={activeRejectId === item.id}
                    onViewReceipt={setReceiptPreview}
                    onApprove={handleApprove}
                    onReject={(nextTarget) => {
                      setRejectTarget(nextTarget);
                      setRejectReason("");
                    }}
                  />
                ))}
                desktopTable={
                  <PendingTransferDesktopTable
                    items={pendingTransfers.items}
                    locale={locale}
                    activeApprovalId={activeApprovalId}
                    activeRejectId={activeRejectId}
                    onViewReceipt={setReceiptPreview}
                    onApprove={handleApprove}
                    onReject={(nextTarget) => {
                      setRejectTarget(nextTarget);
                      setRejectReason("");
                    }}
                  />
                }
              />
            ) : null}
          </div>
        </section>

        <AllPaymentsSection onViewReceipt={setReceiptPreview} />
      </div>

      {receiptPreview ? (
        <Suspense fallback={null}>
          <LazyPaymentReceiptLightbox
            open={Boolean(receiptPreview)}
            onOpenChange={(open) => {
              if (!open) {
                closeReceiptPreview();
              }
            }}
            preview={receiptPreview}
          />
        </Suspense>
      ) : null}

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => (!open ? closeRejectDialog() : undefined)}
      >
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-[1.5rem] border border-[#1D1D1D] bg-[#0A0A0A] p-0 text-white sm:max-w-xl">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                {tAdmin("payments_pending_reject_dialog_title")}
              </DialogTitle>
              <DialogDescription className="font-sans text-sm leading-6 text-[#B4B4B4]">
                {tAdmin("payments_pending_reject_dialog_description")}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5">
              <label
                htmlFor="pending-payment-rejection-reason"
                className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#8F8F8F]"
              >
                {tAdmin("payments_pending_reject_reason_label")}
              </label>
              <Textarea
                id="pending-payment-rejection-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={tAdmin("payments_pending_reject_reason_placeholder")}
                className="min-h-[132px] rounded-[1.25rem] border-[#2A2A2A] bg-[#080808] font-sans text-sm text-white placeholder:text-[#5F5F5F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
              />
              {!rejectActionState.canSubmit ? (
                <p className="mt-3 font-sans text-xs text-[#EF4444]">
                  {tAdmin("payments_pending_reject_disabled")}
                </p>
              ) : null}
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={closeRejectDialog}
                disabled={rejectMutation.isPending}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#101010]"
              >
                {tAdmin("payments_pending_reject_cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleRejectConfirm()}
                disabled={!rejectActionState.canSubmit || rejectMutation.isPending}
                className="min-h-11 rounded-full bg-[#EF4444] px-4 font-sans text-sm font-bold text-white hover:bg-[#DC2626]"
              >
                {rejectMutation.isPending
                  ? tAdmin("payments_pending_reject_loading")
                  : tAdmin("payments_pending_reject_confirm")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
