"use client";

import type {
  AdminOrderDetail,
  AdminOrderPaymentDetail,
  AdminRefundRequestInput,
  AdminRefundResponse,
  AdminRefundType,
} from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MailCheck,
  MailX,
  Receipt,
  ShieldCheck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { humanizeAdminOrderStatus } from "@/hooks/use-admin-orders-filters";
import { cn } from "@/lib/utils";

type AdminOrderRefundModalProps = {
  open: boolean;
  order: AdminOrderDetail | null;
  payment: AdminOrderPaymentDetail | null;
  locale: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: {
    paymentId: string;
    input: AdminRefundRequestInput;
  }) => Promise<AdminRefundResponse>;
};

type RefundStep = "form" | "confirm" | "success";

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

function formatDateTime(value: string, locale: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function resolveMaxRefundAmount(order: AdminOrderDetail, payment: AdminOrderPaymentDetail): number {
  return Math.min(order.refundPolicy.maxRefundAmount, payment.amount);
}

function resolveRefundAmount(params: {
  type: AdminRefundType;
  customAmount: string;
  order: AdminOrderDetail;
  payment: AdminOrderPaymentDetail;
}): number | null {
  const maxAmount = resolveMaxRefundAmount(params.order, params.payment);

  switch (params.type) {
    case "FULL":
      return maxAmount;
    case "PARTIAL":
      return Math.min(params.order.refundPolicy.recommendedAmount, maxAmount);
    case "CUSTOM": {
      const parsed = Number(params.customAmount);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    }
  }
}

export function AdminOrderRefundModal({
  open,
  order,
  payment,
  locale,
  isPending,
  onOpenChange,
  onSubmit,
}: AdminOrderRefundModalProps) {
  const tAdmin = useTranslations("admin");

  const getRefundTypeLabel = (type: AdminRefundType) => {
    switch (type) {
      case "FULL":
        return tAdmin("orders_refund_type_full");
      case "PARTIAL":
        return tAdmin("orders_refund_type_partial");
      case "CUSTOM":
        return tAdmin("orders_refund_type_custom");
    }
  };

  const getRefundTypeDescription = (type: AdminRefundType) => {
    if (!order || !payment) return tAdmin("orders_refund_error_unavailable");

    const maxAmount = resolveMaxRefundAmount(order, payment);
    const recommendedAmount = Math.min(order.refundPolicy.recommendedAmount, maxAmount);

    switch (type) {
      case "FULL":
        return tAdmin("orders_refund_type_full_description", {
          amount: formatCurrency(maxAmount, order.currency, locale),
        });
      case "PARTIAL":
        return tAdmin("orders_refund_type_partial_description", {
          amount: formatCurrency(recommendedAmount, order.currency, locale),
        });
      case "CUSTOM":
        return tAdmin("orders_refund_type_custom_description", {
          amount: formatCurrency(maxAmount, order.currency, locale),
        });
    }
  };

  const allowedRefundTypes = order?.refundPolicy.allowedRefundTypes ?? [];
  const defaultRefundType = useMemo<AdminRefundType | null>(() => {
    if (!order) return null;
    return order.refundPolicy.recommendedRefundType ?? allowedRefundTypes[0] ?? null;
  }, [allowedRefundTypes, order]);
  const resetTargetKey = order && payment ? `${order.id}:${payment.id}` : "no-target";
  const previousResetTargetKeyRef = useRef<string | null>(null);
  const customAmountId = useId();
  const refundReasonId = useId();
  const refundNoteId = useId();

  const [step, setStep] = useState<RefundStep>("form");
  const [refundType, setRefundType] = useState<AdminRefundType | null>(defaultRefundType);
  const [refundReason, setRefundReason] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRefundResponse | null>(null);

  const resetModalState = useCallback((nextRefundType: AdminRefundType | null) => {
    setStep("form");
    setRefundType(nextRefundType);
    setRefundReason("");
    setRefundNote("");
    setCustomAmount("");
    setSubmissionError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) {
      previousResetTargetKeyRef.current = resetTargetKey;
      resetModalState(defaultRefundType);
      return;
    }

    if (previousResetTargetKeyRef.current !== resetTargetKey) {
      previousResetTargetKeyRef.current = resetTargetKey;
      resetModalState(defaultRefundType);
    }
  }, [defaultRefundType, open, resetModalState, resetTargetKey]);

  const maxRefundAmount = order && payment ? resolveMaxRefundAmount(order, payment) : 0;
  const resolvedRefundAmount =
    order && payment && refundType
      ? resolveRefundAmount({
          type: refundType,
          customAmount,
          order,
          payment,
        })
      : null;

  const validationMessage = useMemo(() => {
    if (!order || !payment) return tAdmin("orders_refund_error_unavailable");
    if (!refundType || !allowedRefundTypes.includes(refundType)) {
      return tAdmin("orders_refund_error_invalid_type");
    }
    if (refundReason.trim().length === 0) {
      return tAdmin("orders_refund_error_invalid_reason");
    }
    if (refundType === "CUSTOM") {
      const parsed = Number(customAmount);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maxRefundAmount) {
        return tAdmin("orders_refund_error_invalid_amount", {
          amount: formatCurrency(maxRefundAmount, order.currency, locale),
        });
      }
    }

    return null;
  }, [
    allowedRefundTypes,
    customAmount,
    locale,
    maxRefundAmount,
    order,
    payment,
    refundReason,
    refundType,
    tAdmin,
  ]);

  async function handleConfirmRefund() {
    if (!order || !payment || !refundType || validationMessage || resolvedRefundAmount === null)
      return;

    setSubmissionError(null);

    try {
      const response = await onSubmit({
        paymentId: payment.id,
        input: {
          type: refundType,
          reason: refundReason.trim(),
          note: refundNote.trim() || undefined,
          customAmount: refundType === "CUSTOM" ? resolvedRefundAmount : undefined,
          expectedOrderVersion: order.orderVersion,
          expectedBookVersion: order.book?.version,
          policySnapshot: order.refundPolicy,
        },
      });

      setResult(response);
      setStep("success");
    } catch (error) {
      setSubmissionError(getErrorMessage(error, tAdmin("orders_refund_error_title")));
    }
  }

  const safeOnOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={safeOnOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-1rem)] border-[#2A2A2A] bg-[#050505] p-0 text-white shadow-[0_32px_120px_rgba(0,0,0,0.65)] sm:max-w-[42rem]"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="max-h-[min(90vh,52rem)] overflow-y-auto"
        >
          <div className="border-b border-[#202020] px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
                  {tAdmin("orders_refund_title")}
                </DialogTitle>
                <DialogDescription className="font-sans text-sm leading-6 text-[#AFAFAF]">
                  {tAdmin("orders_refund_description")}
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="rounded-full border border-[#2A2A2A] bg-[#111111] text-white hover:bg-[#171717]"
                aria-label={tAdmin("orders_refund_close")}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            {order && payment ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#202020] bg-[#0C0C0C] p-3">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_payment_amount")}
                  </p>
                  <p className="font-display mt-2 text-lg font-semibold text-white">
                    {formatCurrency(payment.amount, payment.currency, locale)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#202020] bg-[#0C0C0C] p-3">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_payment_provider")}
                  </p>
                  <p className="font-sans mt-2 text-sm text-white">
                    {humanizeAdminOrderStatus(payment.provider)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#202020] bg-[#0C0C0C] p-3">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_stage")}
                  </p>
                  <p className="font-sans mt-2 text-sm text-white">
                    {order.refundPolicy.stageLabel}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <AnimatePresence initial={false} mode="wait">
            {step === "form" ? (
              <motion.div
                key="refund-form"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-5 px-5 py-5 sm:px-6"
              >
                <section className="rounded-[1.4rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      className="mt-0.5 size-5 shrink-0 text-[#007eff]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("orders_detail_policy_label")}
                      </p>
                      <p className="font-display mt-2 text-lg font-semibold text-white">
                        {order?.refundPolicy.stageLabel ?? tAdmin("orders_detail_unknown")}
                      </p>
                      <p className="font-sans mt-2 text-sm leading-6 text-[#B7B7B7]">
                        {order?.refundPolicy.policyMessage ??
                          tAdmin("orders_refund_error_unavailable")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full border border-[#007eff]/35 bg-[#007eff]/12 px-3 py-1 font-sans text-xs text-[#7bb9ff]">
                          {tAdmin("orders_detail_policy_recommended", {
                            type: order?.refundPolicy.recommendedRefundType
                              ? getRefundTypeLabel(order.refundPolicy.recommendedRefundType)
                              : tAdmin("orders_detail_unknown"),
                          })}
                        </span>
                        <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                          {tAdmin("orders_detail_policy_max", {
                            amount:
                              order && payment
                                ? formatCurrency(maxRefundAmount, order.currency, locale)
                                : "—",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <p className="font-sans mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_type_label")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {allowedRefundTypes.map((type) => {
                      const isActive = refundType === type;

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setRefundType(type)}
                          className={cn(
                            "rounded-[1.35rem] border px-4 py-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
                            isActive
                              ? "border-[#007eff]/60 bg-[#007eff]/12"
                              : "border-[#2A2A2A] bg-[#0B0B0B] hover:border-[#3B3B3B]"
                          )}
                        >
                          <p className="font-display text-lg font-semibold text-white">
                            {getRefundTypeLabel(type)}
                          </p>
                          <p className="font-sans mt-2 text-sm leading-6 text-[#B7B7B7]">
                            {getRefundTypeDescription(type)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {refundType === "CUSTOM" && order && payment ? (
                  <div>
                    <label
                      htmlFor={customAmountId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_refund_custom_amount_label")}
                    </label>
                    <Input
                      id={customAmountId}
                      type="number"
                      min={0}
                      max={maxRefundAmount}
                      step="0.01"
                      inputMode="decimal"
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      aria-label={tAdmin("orders_refund_custom_amount_label")}
                      placeholder={tAdmin("orders_refund_custom_amount_placeholder")}
                      className="min-h-11 rounded-2xl border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                    />
                    <p className="font-sans mt-2 text-xs text-[#8F8F8F]">
                      {tAdmin("orders_refund_max_amount", {
                        amount: formatCurrency(maxRefundAmount, order.currency, locale),
                      })}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4">
                  <div>
                    <label
                      htmlFor={refundReasonId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_refund_reason_label")}
                    </label>
                    <Textarea
                      id={refundReasonId}
                      value={refundReason}
                      onChange={(event) => setRefundReason(event.target.value)}
                      aria-label={tAdmin("orders_refund_reason_label")}
                      placeholder={tAdmin("orders_refund_reason_placeholder")}
                      className="min-h-28 rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={refundNoteId}
                      className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                    >
                      {tAdmin("orders_refund_note_label")}
                    </label>
                    <Textarea
                      id={refundNoteId}
                      value={refundNote}
                      onChange={(event) => setRefundNote(event.target.value)}
                      aria-label={tAdmin("orders_refund_note_label")}
                      placeholder={tAdmin("orders_refund_note_placeholder")}
                      className="min-h-24 rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                    />
                  </div>
                </div>

                {validationMessage ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-[#7A1A1A] bg-[#3A0B0B]/70 px-4 py-3 text-sm text-[#FFB2B2]">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p className="font-sans leading-6">{validationMessage}</p>
                  </div>
                ) : null}

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-[#7A1A1A] bg-[#3A0B0B]/70 px-4 py-3 text-sm text-[#FFB2B2]">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p className="font-sans leading-6">{submissionError}</p>
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isPending}
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                  >
                    {tAdmin("orders_refund_cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setStep("confirm")}
                    disabled={Boolean(validationMessage) || isPending}
                    className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                  >
                    {tAdmin("orders_refund_next")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </motion.div>
            ) : null}

            {step === "confirm" &&
            order &&
            payment &&
            refundType &&
            resolvedRefundAmount !== null ? (
              <motion.div
                key="refund-confirm"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-5 px-5 py-5 sm:px-6"
              >
                <section className="rounded-[1.4rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_confirm_heading")}
                  </p>
                  <p className="font-sans mt-3 text-sm leading-6 text-[#B7B7B7]">
                    {tAdmin("orders_refund_confirm_description")}
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#202020] bg-[#101010] px-4 py-3">
                      <span className="font-sans text-sm text-[#AFAFAF]">
                        {tAdmin("orders_refund_confirm_amount")}
                      </span>
                      <span className="font-display text-lg font-semibold text-white">
                        {formatCurrency(resolvedRefundAmount, order.currency, locale)}
                      </span>
                    </div>
                    <div className="rounded-2xl border border-[#202020] bg-[#101010] px-4 py-3">
                      <p className="font-sans text-sm text-[#AFAFAF]">
                        {tAdmin("orders_refund_confirm_policy")}
                      </p>
                      <p className="font-sans mt-1 text-sm leading-6 text-white">
                        {order.refundPolicy.policyMessage}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#202020] bg-[#101010] px-4 py-3">
                      <span className="font-sans text-sm text-[#AFAFAF]">
                        {tAdmin("orders_refund_confirm_audit")}
                      </span>
                      <span className="font-sans text-sm text-white">
                        {tAdmin("orders_refund_confirm_audit_value")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#202020] bg-[#101010] px-4 py-3">
                      <span className="font-sans text-sm text-[#AFAFAF]">
                        {tAdmin("orders_refund_confirm_email")}
                      </span>
                      <span className="font-sans text-sm text-white">
                        {tAdmin("orders_refund_confirm_email_value")}
                      </span>
                    </div>
                  </div>
                </section>

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-[#7A1A1A] bg-[#3A0B0B]/70 px-4 py-3 text-sm text-[#FFB2B2]">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p className="font-sans leading-6">{submissionError}</p>
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("form")}
                    disabled={isPending}
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tAdmin("orders_refund_back")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmRefund}
                    disabled={isPending}
                    className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("orders_refund_submitting")}
                      </>
                    ) : (
                      tAdmin("orders_refund_submit")
                    )}
                  </Button>
                </div>
              </motion.div>
            ) : null}

            {step === "success" && result ? (
              <motion.div
                key="refund-success"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-5 px-5 py-5 sm:px-6"
              >
                <section className="rounded-[1.4rem] border border-[#123A1E] bg-[#0C1A10] p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 size-6 shrink-0 text-[#22c55e]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-display text-2xl font-semibold tracking-tight text-white">
                        {tAdmin("orders_refund_success_title")}
                      </p>
                      <p className="font-sans mt-2 text-sm leading-6 text-[#C6E7CF]">
                        {tAdmin("orders_refund_success_description", {
                          amount: formatCurrency(result.refundedAmount, result.currency, locale),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#1E4729] bg-[#0F1F13] p-3">
                      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#84B68F]">
                        {tAdmin("orders_refund_confirm_email")}
                      </p>
                      <p className="font-sans mt-2 flex items-center gap-2 text-sm text-white">
                        {result.emailSent ? (
                          <MailCheck className="size-4 text-[#22c55e]" aria-hidden="true" />
                        ) : (
                          <MailX className="size-4 text-[#facc15]" aria-hidden="true" />
                        )}
                        {result.emailSent
                          ? tAdmin("orders_refund_success_email_sent")
                          : tAdmin("orders_refund_success_email_pending")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#1E4729] bg-[#0F1F13] p-3">
                      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#84B68F]">
                        {tAdmin("orders_refund_processing_mode")}
                      </p>
                      <p className="font-sans mt-2 flex items-center gap-2 text-sm text-white">
                        <Receipt className="size-4 text-[#22c55e]" aria-hidden="true" />
                        {result.processingMode === "gateway"
                          ? tAdmin("orders_refund_success_processing_gateway")
                          : tAdmin("orders_refund_success_processing_manual")}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[1.4rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("orders_refund_audit_label")}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#202020] bg-[#101010] p-3">
                      <p className="font-sans text-xs text-[#AFAFAF]">
                        {tAdmin("orders_refund_audit_action")}
                      </p>
                      <p className="font-sans mt-1 text-sm text-white">{result.audit.action}</p>
                    </div>
                    <div className="rounded-2xl border border-[#202020] bg-[#101010] p-3">
                      <p className="font-sans text-xs text-[#AFAFAF]">
                        {tAdmin("orders_refund_audit_recorded_at")}
                      </p>
                      <p className="font-sans mt-1 text-sm text-white">
                        {formatDateTime(result.audit.recordedAt, locale)}
                      </p>
                    </div>
                  </div>
                </section>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                  >
                    {tAdmin("orders_refund_success_close")}
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
