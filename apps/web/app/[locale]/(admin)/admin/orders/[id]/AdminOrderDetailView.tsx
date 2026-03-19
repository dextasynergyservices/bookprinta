"use client";

import type {
  AdminOrderDetail,
  AdminOrderPaymentDetail,
  AdminRefundRequestInput,
  OrderStatus,
} from "@bookprinta/shared";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/dashboard/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { humanizeAdminOrderStatus } from "@/hooks/use-admin-orders-filters";
import {
  isAdminOrderConflictError,
  useAdminOrderStatusMutation,
  useAdminRefundMutation,
} from "@/hooks/useAdminOrderActions";
import { useAdminOrderDetail } from "@/hooks/useAdminOrderDetail";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { AdminOrderRefundModal } from "./AdminOrderRefundModal";

type AdminOrderDetailViewProps = {
  orderId: string;
};

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};
const DETAIL_SUMMARY_SKELETON_IDS = [
  "detail-summary-skeleton-1",
  "detail-summary-skeleton-2",
  "detail-summary-skeleton-3",
  "detail-summary-skeleton-4",
] as const;
const DETAIL_ASIDE_SKELETON_IDS = [
  "detail-aside-skeleton-1",
  "detail-aside-skeleton-2",
  "detail-aside-skeleton-3",
  "detail-aside-skeleton-4",
] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;

  const currencyCode = (currency || "NGN").toUpperCase();

  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return fallback;
  }
}

function formatDateTime(
  value: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatDate(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function InfoCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-[1.5rem] border border-[#1E1E1E] bg-[#111111] p-4 md:p-5", className)}
    >
      <div className="mb-4">
        {eyebrow ? (
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display mt-2 text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {description ? (
          <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#202020] bg-[#0B0B0B] p-3">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <p className="font-sans mt-2 text-sm leading-6 text-white [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <p className="font-display mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="font-sans mt-2 text-xs leading-5 text-[#8F8F8F]">{hint}</p> : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <Skeleton className="h-4 w-28 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-4 h-10 w-56 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-3 h-5 w-full max-w-3xl bg-[#1B1B1B]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.95fr)]">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DETAIL_SUMMARY_SKELETON_IDS.map((skeletonId) => (
              <Skeleton key={skeletonId} className="h-36 rounded-[1.5rem] bg-[#171717]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[1.5rem] bg-[#171717]" />
          <Skeleton className="h-96 rounded-[1.5rem] bg-[#171717]" />
        </div>
        <div className="grid gap-4">
          {DETAIL_ASIDE_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-56 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function AdminOrderDetailView({ orderId }: AdminOrderDetailViewProps) {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const detailQuery = useAdminOrderDetail({
    orderId,
    enabled: Boolean(orderId),
  });
  const statusMutation = useAdminOrderStatusMutation(orderId);
  const refundMutation = useAdminRefundMutation(orderId);
  const nextStatusId = useId();
  const statusReasonId = useId();
  const statusNoteId = useId();

  const order = detailQuery.data;
  const [selectedNextStatus, setSelectedNextStatus] = useState<OrderStatus | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [refundTarget, setRefundTarget] = useState<AdminOrderPaymentDetail | null>(null);

  useEffect(() => {
    if (!order) return;

    const firstNextStatus = order.statusControl.nextAllowedStatuses[0] ?? "";
    setSelectedNextStatus((current) =>
      current && order.statusControl.nextAllowedStatuses.includes(current as OrderStatus)
        ? current
        : firstNextStatus
    );
  }, [order]);

  const refundablePayments = order?.payments.filter((payment) => payment.isRefundable) ?? [];
  const statusSourceLabel = order
    ? order.statusSource === "book"
      ? tAdmin("orders_detail_status_source_book")
      : tAdmin("orders_detail_status_source_order")
    : tAdmin("orders_detail_unknown");

  const summaryValues = useMemo(() => {
    if (!order) {
      return {
        total: "—",
        refunded: "—",
        maxRefund: "—",
      };
    }

    return {
      total: formatCurrency(order.totalAmount, order.currency, locale, "—"),
      refunded: formatCurrency(order.refundAmount, order.currency, locale, "—"),
      maxRefund: formatCurrency(order.refundPolicy.maxRefundAmount, order.currency, locale, "—"),
    };
  }, [locale, order]);

  async function handleStatusAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !selectedNextStatus) return;

    try {
      const response = await statusMutation.mutateAsync({
        nextStatus: selectedNextStatus,
        expectedVersion: order.statusControl.expectedVersion,
        reason: statusReason.trim() || undefined,
        note: statusNote.trim() || undefined,
      });

      setStatusReason("");
      setStatusNote("");
      toast.success(tAdmin("orders_detail_status_success"), {
        description: tAdmin("orders_detail_status_success_description", {
          status: humanizeAdminOrderStatus(response.nextStatus),
        }),
      });
    } catch (error) {
      if (isAdminOrderConflictError(error)) {
        toast.error(tAdmin("orders_detail_conflict_title"), {
          description: getErrorMessage(error, tAdmin("orders_detail_conflict_description")),
        });
        detailQuery.refetch();
        return;
      }

      toast.error(tAdmin("orders_detail_status_error_title"), {
        description: getErrorMessage(error, tAdmin("orders_detail_status_error_description")),
      });
    }
  }

  async function handleRefund(params: { paymentId: string; input: AdminRefundRequestInput }) {
    try {
      const response = await refundMutation.mutateAsync(params);
      toast.success(tAdmin("orders_refund_success_toast"), {
        description: tAdmin("orders_refund_success_toast_description", {
          amount: formatCurrency(response.refundedAmount, response.currency, locale, "—"),
        }),
      });
      return response;
    } catch (error) {
      toast.error(tAdmin("orders_refund_error_title"), {
        description: getErrorMessage(error, tAdmin("orders_refund_error_title")),
      });
      throw error;
    }
  }

  if (detailQuery.isInitialLoading) {
    return <DetailSkeleton />;
  }

  if (detailQuery.isError || !order) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-6 md:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 size-5 shrink-0 text-[#ff6b6b]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                {tAdmin("orders_detail_error_title")}
              </p>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#FFC5C5]">
                {detailQuery.error instanceof Error && detailQuery.error.message
                  ? detailQuery.error.message
                  : tAdmin("orders_detail_error_description")}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => detailQuery.refetch()}
                  className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {tAdmin("orders_detail_refetch")}
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                >
                  <Link href="/admin/orders">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tAdmin("orders_back_to_list")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="grid min-w-0 gap-4"
      >
        <header className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="h-auto rounded-full border border-[#202020] bg-[#0C0C0C] px-4 py-2 font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#C9C9C9] hover:bg-[#111111]"
              >
                <Link href="/admin/orders">
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  {tAdmin("orders_back_to_list")}
                </Link>
              </Button>

              <p className="font-sans mt-4 text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
                {tAdmin("panel_label")}
              </p>
              <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {order.orderNumber}
              </h1>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
                {tAdmin("orders_detail_description")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <OrderStatusBadge
                  orderStatus={order.orderStatus}
                  bookStatus={order.bookStatus}
                  label={humanizeAdminOrderStatus(order.displayStatus)}
                />
                <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                  {statusSourceLabel}
                </span>
                {refundMutation.isPending ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#007eff]/35 bg-[#007eff]/12 px-3 py-1 font-sans text-xs text-[#7bb9ff]">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {tAdmin("orders_refund_submitting")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:max-w-[24rem]">
              <DetailValue
                label={tAdmin("orders_detail_meta_created")}
                value={formatDateTime(order.createdAt, locale, tAdmin("orders_date_unavailable"))}
              />
              <DetailValue
                label={tAdmin("orders_detail_meta_updated")}
                value={formatDateTime(order.updatedAt, locale, tAdmin("orders_date_unavailable"))}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.95fr)]">
          <div className="grid gap-4">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label={tAdmin("orders_detail_summary_total")}
                value={summaryValues.total}
                hint={tAdmin("orders_detail_financial_total_amount")}
              />
              <MetricTile
                label={tAdmin("orders_detail_summary_refunded")}
                value={summaryValues.refunded}
                hint={tAdmin("orders_detail_financial_refund_amount")}
              />
              <MetricTile
                label={tAdmin("orders_detail_summary_refund_ceiling")}
                value={summaryValues.maxRefund}
                hint={tAdmin("orders_detail_policy_stage", {
                  stage: order.refundPolicy.stageLabel,
                })}
              />
              <MetricTile
                label={tAdmin("orders_detail_summary_payments")}
                value={String(order.payments.length)}
                hint={tAdmin("orders_detail_summary_refundable_hint", {
                  count: refundablePayments.length,
                })}
              />
            </section>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_payments_eyebrow")}
              title={tAdmin("orders_detail_section_payments")}
              description={tAdmin("orders_detail_section_payments_description")}
            >
              <div className="space-y-3">
                {order.payments.length === 0 ? (
                  <p className="font-sans text-sm text-[#8F8F8F]">
                    {tAdmin("orders_detail_empty_payments")}
                  </p>
                ) : (
                  order.payments.map((payment) => (
                    <article
                      key={payment.id}
                      className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.provider)}
                            </span>
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.type)}
                            </span>
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.status)}
                            </span>
                          </div>
                          <p className="font-display mt-3 text-2xl font-semibold tracking-tight text-white">
                            {formatCurrency(payment.amount, payment.currency, locale, "—")}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          {payment.receiptUrl ? (
                            <Button
                              asChild
                              type="button"
                              variant="outline"
                              className="min-h-10 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                            >
                              <a href={payment.receiptUrl} target="_blank" rel="noreferrer">
                                {tAdmin("orders_detail_payment_receipt_action")}
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            onClick={() => setRefundTarget(payment)}
                            disabled={!payment.isRefundable || refundMutation.isPending}
                            className="min-h-10 rounded-full bg-[#007eff] px-4 font-sans text-xs font-medium text-white hover:bg-[#0068d8] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                          >
                            {payment.isRefundable
                              ? tAdmin("orders_detail_payment_refund_action")
                              : tAdmin("orders_detail_payment_not_refundable")}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <DetailValue
                          label={tAdmin("orders_detail_payment_reference")}
                          value={payment.providerRef ?? tAdmin("orders_detail_unknown")}
                        />
                        <DetailValue
                          label={tAdmin("orders_detail_payment_created")}
                          value={formatDateTime(
                            payment.createdAt,
                            locale,
                            tAdmin("orders_date_unavailable")
                          )}
                        />
                        <DetailValue
                          label={tAdmin("orders_detail_payment_processed")}
                          value={formatDateTime(
                            payment.processedAt,
                            locale,
                            tAdmin("orders_detail_unknown")
                          )}
                        />
                        <DetailValue
                          label={tAdmin("orders_detail_payment_approved")}
                          value={formatDateTime(
                            payment.approvedAt,
                            locale,
                            tAdmin("orders_detail_unknown")
                          )}
                        />
                        <DetailValue
                          label={tAdmin("orders_detail_payment_payer")}
                          value={
                            payment.payerName ||
                            payment.payerEmail ||
                            payment.payerPhone ||
                            tAdmin("orders_detail_unknown")
                          }
                        />
                        <DetailValue
                          label={tAdmin("orders_detail_payment_admin_note")}
                          value={payment.adminNote ?? tAdmin("orders_detail_unknown")}
                        />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_addons_eyebrow")}
              title={tAdmin("orders_detail_section_addons")}
              description={tAdmin("orders_detail_section_addons_description")}
            >
              {order.addons.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("orders_detail_empty_addons")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {order.addons.map((addon) => (
                    <div
                      key={addon.id}
                      className="grid gap-3 rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4 md:grid-cols-3"
                    >
                      <DetailValue label={tAdmin("orders_table_package")} value={addon.name} />
                      <DetailValue
                        label={tAdmin("orders_detail_addon_price")}
                        value={formatCurrency(addon.price, order.currency, locale, "—")}
                      />
                      <DetailValue
                        label={tAdmin("orders_detail_addon_word_count")}
                        value={
                          addon.wordCount
                            ? String(addon.wordCount)
                            : tAdmin("orders_detail_unknown")
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>

          <aside className="grid gap-4 self-start">
            <InfoCard
              eyebrow={tAdmin("orders_detail_section_status_control_eyebrow")}
              title={tAdmin("orders_detail_section_status_control")}
              description={tAdmin("orders_detail_section_status_control_description")}
            >
              {order.statusControl.nextAllowedStatuses.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("orders_detail_status_locked")}
                </p>
              ) : (
                <form className="space-y-4" onSubmit={handleStatusAdvance}>
                  <div>
                    <label
                      htmlFor={nextStatusId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_detail_status_next_label")}
                    </label>
                    <select
                      id={nextStatusId}
                      value={selectedNextStatus}
                      onChange={(event) =>
                        setSelectedNextStatus(event.target.value as OrderStatus | "")
                      }
                      aria-label={tAdmin("orders_detail_status_next_label")}
                      disabled={statusMutation.isPending}
                      className="min-h-11 w-full rounded-2xl border border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white outline-none transition-colors duration-150 focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
                    >
                      {order.statusControl.nextAllowedStatuses.map((status) => (
                        <option key={status} value={status}>
                          {humanizeAdminOrderStatus(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={statusReasonId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_detail_status_reason_label")}
                    </label>
                    <Input
                      id={statusReasonId}
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      aria-label={tAdmin("orders_detail_status_reason_label")}
                      disabled={statusMutation.isPending}
                      placeholder={tAdmin("orders_detail_status_reason_placeholder")}
                      className="min-h-11 rounded-2xl border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={statusNoteId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_detail_status_note_label")}
                    </label>
                    <Textarea
                      id={statusNoteId}
                      value={statusNote}
                      onChange={(event) => setStatusNote(event.target.value)}
                      aria-label={tAdmin("orders_detail_status_note_label")}
                      disabled={statusMutation.isPending}
                      placeholder={tAdmin("orders_detail_status_note_placeholder")}
                      className="min-h-24 rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!selectedNextStatus || statusMutation.isPending}
                    className="min-h-11 w-full rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                  >
                    {statusMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("orders_detail_status_submitting")}
                      </>
                    ) : (
                      tAdmin("orders_detail_status_submit")
                    )}
                  </Button>
                </form>
              )}
            </InfoCard>
            <InfoCard
              eyebrow={tAdmin("orders_detail_policy_eyebrow")}
              title={tAdmin("orders_detail_policy_label")}
              description={tAdmin("orders_detail_policy_description")}
            >
              <div className="space-y-3">
                <DetailValue
                  label={tAdmin("orders_detail_policy_stage_label")}
                  value={order.refundPolicy.stageLabel}
                />
                <DetailValue
                  label={tAdmin("orders_detail_policy_decision_label")}
                  value={humanizeAdminOrderStatus(order.refundPolicy.policyDecision)}
                />
                <DetailValue
                  label={tAdmin("orders_detail_policy_allowed_types")}
                  value={
                    order.refundPolicy.allowedRefundTypes.length > 0
                      ? order.refundPolicy.allowedRefundTypes
                          .map((type) => humanizeAdminOrderStatus(type))
                          .join(", ")
                      : tAdmin("orders_detail_payment_not_refundable")
                  }
                />
                <DetailValue
                  label={tAdmin("orders_detail_policy_message")}
                  value={order.refundPolicy.policyMessage}
                />
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_customer_eyebrow")}
              title={tAdmin("orders_detail_section_customer")}
            >
              <div className="grid gap-3">
                <DetailValue
                  label={tAdmin("orders_table_customer")}
                  value={order.customer.fullName}
                />
                <DetailValue label={tAdmin("orders_table_email")} value={order.customer.email} />
                <DetailValue
                  label={tAdmin("orders_detail_customer_phone")}
                  value={order.customer.phoneNumber ?? tAdmin("orders_customer_phone_unavailable")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_customer_language")}
                  value={order.customer.preferredLanguage.toUpperCase()}
                />
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_book_eyebrow")}
              title={tAdmin("orders_detail_section_book")}
              description={tAdmin("orders_detail_book_summary_description")}
            >
              <div className="space-y-4">
                <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-sm leading-6 text-[#B7B7B7]">
                    {tAdmin("orders_detail_book_workspace_note")}
                  </p>
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    className="mt-4 min-h-10 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                  >
                    <Link href="/admin/books">{tAdmin("orders_detail_book_workspace_action")}</Link>
                  </Button>
                </div>

                {order.book ? (
                  <div className="grid gap-3">
                    <DetailValue
                      label={tAdmin("orders_detail_book_production_status")}
                      value={
                        order.book.productionStatus
                          ? humanizeAdminOrderStatus(order.book.productionStatus)
                          : tAdmin("orders_detail_unknown")
                      }
                    />
                    <DetailValue
                      label={tAdmin("orders_detail_book_status")}
                      value={humanizeAdminOrderStatus(order.book.status)}
                    />
                    <DetailValue
                      label={tAdmin("orders_detail_meta_updated")}
                      value={formatDateTime(
                        order.book.updatedAt,
                        locale,
                        tAdmin("orders_date_unavailable")
                      )}
                    />
                    <DetailValue
                      label={tAdmin("orders_detail_book_pages")}
                      value={
                        order.book.pageCount
                          ? String(order.book.pageCount)
                          : tAdmin("orders_detail_unknown")
                      }
                    />
                    <DetailValue
                      label={tAdmin("orders_detail_book_words")}
                      value={
                        order.book.wordCount
                          ? String(order.book.wordCount)
                          : tAdmin("orders_detail_unknown")
                      }
                    />
                    <DetailValue
                      label={tAdmin("orders_detail_book_version")}
                      value={String(order.book.version)}
                    />
                    {order.book.rejectionReason ? (
                      <DetailValue
                        label={tAdmin("orders_detail_book_rejection")}
                        value={order.book.rejectionReason}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p className="font-sans text-sm text-[#8F8F8F]">
                    {tAdmin("orders_detail_empty_book")}
                  </p>
                )}
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_shipping_eyebrow")}
              title={tAdmin("orders_detail_section_shipping")}
            >
              {order.shippingAddress ? (
                <div className="grid gap-3">
                  <DetailValue
                    label={tAdmin("orders_detail_shipping_address")}
                    value={[
                      order.shippingAddress.street,
                      order.shippingAddress.city,
                      order.shippingAddress.state,
                      order.shippingAddress.country,
                      order.shippingAddress.zipCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <DetailValue
                    label={tAdmin("orders_detail_shipping_tracking")}
                    value={order.trackingNumber ?? tAdmin("orders_detail_unknown")}
                  />
                  <DetailValue
                    label={tAdmin("orders_detail_shipping_provider")}
                    value={order.shippingProvider ?? tAdmin("orders_detail_unknown")}
                  />
                </div>
              ) : (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("orders_detail_empty_shipping")}
                </p>
              )}
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("orders_detail_section_financial_eyebrow")}
              title={tAdmin("orders_detail_section_financial")}
            >
              <div className="grid gap-3">
                <DetailValue
                  label={tAdmin("orders_detail_financial_package_amount")}
                  value={formatCurrency(order.initialAmount, order.currency, locale, "—")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_extra_amount")}
                  value={formatCurrency(order.extraAmount, order.currency, locale, "—")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_discount_amount")}
                  value={formatCurrency(order.discountAmount, order.currency, locale, "—")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_total_amount")}
                  value={formatCurrency(order.totalAmount, order.currency, locale, "—")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_refund_amount")}
                  value={formatCurrency(order.refundAmount, order.currency, locale, "—")}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_order_type")}
                  value={humanizeAdminOrderStatus(order.orderType)}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_copies")}
                  value={String(order.copies)}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_size")}
                  value={order.bookSize}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_paper")}
                  value={order.paperColor}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_lamination")}
                  value={order.lamination}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_refunded_at")}
                  value={formatDate(order.refundedAt, locale, tAdmin("orders_detail_unknown"))}
                />
                <DetailValue
                  label={tAdmin("orders_detail_financial_refund_reason")}
                  value={order.refundReason ?? tAdmin("orders_detail_unknown")}
                />
              </div>
            </InfoCard>
          </aside>
        </div>
      </motion.section>

      <AdminOrderRefundModal
        open={refundTarget !== null}
        order={order as AdminOrderDetail}
        payment={refundTarget}
        locale={locale}
        isPending={refundMutation.isPending}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRefundTarget(null);
          }
        }}
        onSubmit={handleRefund}
      />
    </>
  );
}
