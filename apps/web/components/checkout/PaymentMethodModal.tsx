"use client";

import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Landmark,
  Loader2,
  ShieldCheck,
  XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  initializePayment,
  type OnlinePaymentProvider,
  submitBankTransfer,
  usePaymentGateways,
} from "@/hooks/usePayments";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PaymentMetadata } from "@/stores/usePricingStore";

interface PaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  packageName: string;
  paymentMetadata: PaymentMetadata;
}

type PaymentChoice = "online" | "bank_transfer";

type BankAccount = {
  accountName: string;
  accountNumber: string;
  bank: string;
};

const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
const RECEIPT_ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function isSupportedOnlineProvider(provider: string): provider is OnlinePaymentProvider {
  return provider === "PAYSTACK" || provider === "STRIPE" || provider === "PAYPAL";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseBankAccounts(bankDetails: Record<string, unknown> | null): BankAccount[] {
  if (!bankDetails || typeof bankDetails !== "object") return [];
  const rawAccounts = bankDetails.accounts;
  if (!Array.isArray(rawAccounts)) return [];

  return rawAccounts
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const accountName =
        typeof (entry as Record<string, unknown>).accountName === "string"
          ? (entry as Record<string, string>).accountName
          : "";
      const accountNumber =
        typeof (entry as Record<string, unknown>).accountNumber === "string"
          ? (entry as Record<string, string>).accountNumber
          : "";
      const bank =
        typeof (entry as Record<string, unknown>).bank === "string"
          ? (entry as Record<string, string>).bank
          : "";

      if (!accountName || !accountNumber || !bank) return null;
      return { accountName, accountNumber, bank };
    })
    .filter((entry): entry is BankAccount => entry !== null);
}

export function PaymentMethodModal({
  open,
  onOpenChange,
  amount,
  packageName,
  paymentMetadata,
}: PaymentMethodModalProps) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: gateways, isLoading, isError, refetch } = usePaymentGateways(open);

  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice | null>(null);
  const [onlineProvider, setOnlineProvider] = useState<OnlinePaymentProvider | null>(null);
  const [onlineFullName, setOnlineFullName] = useState("");
  const [onlineEmail, setOnlineEmail] = useState("");
  const [onlinePhone, setOnlinePhone] = useState("");
  const [showBankReceiptForm, setShowBankReceiptForm] = useState(false);
  const [bankFullName, setBankFullName] = useState("");
  const [bankEmail, setBankEmail] = useState("");
  const [bankPhone, setBankPhone] = useState("");
  const [bankReceiptFile, setBankReceiptFile] = useState<File | null>(null);
  const [bankReceiptError, setBankReceiptError] = useState<string | null>(null);

  const modalMotion = isMobile
    ? {
        initial: { y: "100%" as const, opacity: 1 },
        animate: { y: "0%", opacity: 1 },
        exit: { y: "100%", opacity: 1 },
      }
    : {
        initial: { y: 18, opacity: 0, scale: 0.96 },
        animate: { y: 0, opacity: 1, scale: 1 },
        exit: { y: 14, opacity: 0, scale: 0.98 },
      };

  const onlineGateways = useMemo(
    () => (gateways ?? []).filter((gateway) => gateway.provider !== "BANK_TRANSFER"),
    [gateways]
  );

  const bankGateway = useMemo(
    () => (gateways ?? []).find((gateway) => gateway.provider === "BANK_TRANSFER") ?? null,
    [gateways]
  );

  const bankAccounts = useMemo(
    () => parseBankAccounts(bankGateway?.bankDetails ?? null),
    [bankGateway?.bankDetails]
  );

  const initializeMutation = useMutation({
    mutationFn: initializePayment,
    onSuccess: (response) => {
      if (!response.authorizationUrl) {
        toast.error(t("payment_modal_online_error"));
        return;
      }
      window.location.assign(response.authorizationUrl);
    },
    onError: (error) => {
      toast.error(t("payment_modal_online_error"), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const bankTransferMutation = useMutation({
    mutationFn: submitBankTransfer,
    onSuccess: (response, variables) => {
      toast.success(t("payment_modal_bank_success"), {
        description: response.message,
      });
      onOpenChange(false);
      const emailQuery = encodeURIComponent(variables.payerEmail);
      router.push(`/checkout/confirmation?email=${emailQuery}`);
    },
    onError: (error) => {
      toast.error(t("payment_modal_bank_error"), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const resetInitializeMutation = initializeMutation.reset;
  const resetBankTransferMutation = bankTransferMutation.reset;

  useEffect(() => {
    if (open) return;

    setPaymentChoice(null);
    setOnlineProvider(null);
    setOnlineFullName("");
    setOnlineEmail("");
    setOnlinePhone("");
    setShowBankReceiptForm(false);
    setBankFullName("");
    setBankEmail("");
    setBankPhone("");
    setBankReceiptFile(null);
    setBankReceiptError(null);
    resetInitializeMutation();
    resetBankTransferMutation();
  }, [open, resetBankTransferMutation, resetInitializeMutation]);

  const isOnlineFormComplete =
    onlineProvider !== null &&
    onlineFullName.trim().length >= 2 &&
    isValidEmail(onlineEmail.trim()) &&
    onlinePhone.trim().length >= 7;

  const isBankFormComplete =
    bankFullName.trim().length >= 2 &&
    isValidEmail(bankEmail.trim()) &&
    bankPhone.trim().length >= 7 &&
    bankReceiptFile !== null;

  const submitOnlinePayment = () => {
    if (!isOnlineFormComplete || !onlineProvider) return;

    const callbackUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/${locale}/checkout/payment-return/${onlineProvider.toLowerCase()}`
        : undefined;

    initializeMutation.mutate({
      provider: onlineProvider,
      email: onlineEmail.trim(),
      amount,
      currency: "NGN",
      callbackUrl,
      metadata: {
        locale,
        fullName: onlineFullName.trim(),
        phone: onlinePhone.trim(),
        ...paymentMetadata,
      },
    });
  };

  const handleReceiptFileChange = (file: File | null) => {
    setBankReceiptError(null);
    setBankReceiptFile(null);

    if (!file) return;

    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setBankReceiptError(t("payment_modal_bank_receipt_too_large"));
      return;
    }

    if (!RECEIPT_ALLOWED_TYPES.has(file.type)) {
      setBankReceiptError(t("payment_modal_bank_receipt_invalid_type"));
      return;
    }

    setBankReceiptFile(file);
  };

  const submitBankPayment = () => {
    if (!isBankFormComplete || !bankReceiptFile) return;

    bankTransferMutation.mutate({
      payerName: bankFullName.trim(),
      payerEmail: bankEmail.trim().toLowerCase(),
      payerPhone: bankPhone.trim(),
      amount,
      currency: "NGN",
      receiptFile: bankReceiptFile,
      metadata: {
        ...paymentMetadata,
        locale,
        fullName: bankFullName.trim(),
        phone: bankPhone.trim(),
        payerEmail: bankEmail.trim().toLowerCase(),
        email: bankEmail.trim().toLowerCase(),
      },
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                {...modalMotion}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "z-50 flex flex-col overflow-hidden bg-black text-white outline-none",
                  isMobile
                    ? "fixed inset-0 h-dvh w-full px-5 pb-5 pt-4"
                    : "fixed top-1/2 left-1/2 h-[min(88dvh,900px)] w-[min(760px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[30px] border border-[#2A2A2A] px-8 pb-8 pt-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                )}
              >
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#007eff]/20 blur-3xl" />
                </div>

                <div className="relative z-10 flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <DialogPrimitive.Title className="font-display text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
                        {t("payment_modal_title")}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="mt-2 font-sans text-sm text-white/65">
                        {t("payment_modal_subtitle")}
                      </DialogPrimitive.Description>
                    </div>

                    <DialogPrimitive.Close asChild>
                      <button
                        type="button"
                        aria-label={t("payment_modal_close_aria")}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] bg-black/65 text-white/85 transition-colors duration-200 hover:border-[#007eff] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        <XIcon className="size-5" aria-hidden="true" />
                      </button>
                    </DialogPrimitive.Close>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#2A2A2A] bg-[#0a0a0a] px-4 py-3">
                    <p className="font-sans text-[11px] tracking-[0.08em] text-white/45 uppercase">
                      {t("payment_modal_summary_label", { packageName })}
                    </p>
                    <p className="mt-1 font-sans text-2xl font-semibold text-white">
                      {formatPrice(amount)}
                    </p>
                  </div>

                  <div className="mt-5 flex-1 overflow-y-auto pb-4" data-lenis-prevent>
                    {paymentChoice && (
                      <button
                        type="button"
                        onClick={() => setPaymentChoice(null)}
                        className="mb-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-black px-4 font-sans text-sm font-medium text-white/80 transition-colors duration-150 hover:border-[#007eff] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        {t("payment_modal_back")}
                      </button>
                    )}

                    {!paymentChoice ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPaymentChoice("online")}
                          className="flex min-h-11 min-w-11 flex-col items-start gap-2 rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] p-4 text-left transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        >
                          <span className="flex size-9 items-center justify-center rounded-full border border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]">
                            <CreditCard className="size-4" aria-hidden="true" />
                          </span>
                          <p className="font-sans text-base font-semibold text-white">
                            {t("payment_modal_option_online")}
                          </p>
                          <p className="font-sans text-sm text-white/60">
                            {t("payment_modal_option_online_desc")}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentChoice("bank_transfer")}
                          className="flex min-h-11 min-w-11 flex-col items-start gap-2 rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] p-4 text-left transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        >
                          <span className="flex size-9 items-center justify-center rounded-full border border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]">
                            <Landmark className="size-4" aria-hidden="true" />
                          </span>
                          <p className="font-sans text-base font-semibold text-white">
                            {t("payment_modal_option_bank")}
                          </p>
                          <p className="font-sans text-sm text-white/60">
                            {t("payment_modal_option_bank_desc")}
                          </p>
                        </button>
                      </div>
                    ) : null}

                    {paymentChoice === "online" ? (
                      <div className="space-y-4">
                        <div>
                          <p className="font-sans text-base font-semibold text-white">
                            {t("payment_modal_online_title")}
                          </p>
                          <p className="mt-1 font-sans text-sm text-white/60">
                            {t("payment_modal_online_subtitle")}
                          </p>
                        </div>

                        {isLoading ? (
                          <div className="flex items-center gap-2 rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] px-4 py-3">
                            <Loader2
                              className="size-4 animate-spin text-[#007eff]"
                              aria-hidden="true"
                            />
                            <span className="font-sans text-sm text-white/65">
                              {t("payment_modal_loading")}
                            </span>
                          </div>
                        ) : isError ? (
                          <div className="rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] p-4">
                            <p className="font-sans text-sm text-white/65">
                              {t("payment_modal_online_error")}
                            </p>
                            <button
                              type="button"
                              onClick={() => refetch()}
                              className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            >
                              {t("payment_modal_retry")}
                            </button>
                          </div>
                        ) : onlineGateways.length === 0 ? (
                          <p className="rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] px-4 py-3 font-sans text-sm text-white/65">
                            {t("payment_modal_online_no_methods")}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {onlineGateways.map((gateway) => {
                              const supportedProvider = isSupportedOnlineProvider(gateway.provider)
                                ? gateway.provider
                                : null;
                              const isSupported = supportedProvider !== null;
                              const isSelected =
                                supportedProvider !== null && onlineProvider === supportedProvider;
                              return (
                                <button
                                  key={gateway.id}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    if (!supportedProvider) return;
                                    setOnlineProvider(supportedProvider);
                                  }}
                                  disabled={!isSupported}
                                  className={cn(
                                    "flex min-h-11 min-w-11 flex-col items-start rounded-2xl border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                                    isSupported
                                      ? "border-[#2A2A2A] bg-[#0d0d0d] hover:border-[#007eff]"
                                      : "cursor-not-allowed border-[#2A2A2A] bg-[#0b0b0b] opacity-60",
                                    isSelected && "border-[#007eff] bg-[#06101a]"
                                  )}
                                >
                                  <p className="font-sans text-sm font-semibold text-white">
                                    {gateway.name}
                                  </p>
                                  {!isSupported ? (
                                    <p className="mt-1 font-sans text-xs text-white/55">
                                      {t("payment_modal_online_provider_unsupported")}
                                    </p>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3">
                          <input
                            type="text"
                            value={onlineFullName}
                            onChange={(event) => setOnlineFullName(event.target.value)}
                            placeholder={t("payment_modal_form_full_name")}
                            aria-label={t("payment_modal_form_full_name")}
                            className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                          />
                          <input
                            type="email"
                            value={onlineEmail}
                            onChange={(event) => setOnlineEmail(event.target.value)}
                            placeholder={t("payment_modal_form_email")}
                            aria-label={t("payment_modal_form_email")}
                            className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                          />
                          <input
                            type="tel"
                            value={onlinePhone}
                            onChange={(event) => setOnlinePhone(event.target.value)}
                            placeholder={t("payment_modal_form_phone")}
                            aria-label={t("payment_modal_form_phone")}
                            className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={submitOnlinePayment}
                          disabled={!isOnlineFormComplete || initializeMutation.isPending}
                          className={cn(
                            "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-5 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                            !isOnlineFormComplete || initializeMutation.isPending
                              ? "cursor-not-allowed border border-[#2A2A2A] bg-[#121212] text-white/45"
                              : "bg-[#007eff] text-white hover:brightness-110"
                          )}
                        >
                          {initializeMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                              {t("payment_modal_loading")}
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                              {t("payment_modal_pay_now")}
                            </>
                          )}
                        </button>
                      </div>
                    ) : null}

                    {paymentChoice === "bank_transfer" ? (
                      <div className="space-y-4">
                        <div>
                          <p className="font-sans text-base font-semibold text-white">
                            {t("payment_modal_bank_title")}
                          </p>
                          <p className="mt-1 font-sans text-sm text-white/60">
                            {t("payment_modal_bank_subtitle")}
                          </p>
                        </div>

                        {!bankGateway ? (
                          <p className="rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] px-4 py-3 font-sans text-sm text-white/65">
                            {t("payment_modal_bank_unavailable")}
                          </p>
                        ) : (
                          <>
                            <div className="rounded-2xl border border-[#2A2A2A] bg-[#0d0d0d] p-4">
                              <p className="font-sans text-xs font-semibold tracking-[0.08em] text-white/45 uppercase">
                                {t("payment_modal_bank_instructions_label")}
                              </p>
                              <p className="mt-2 font-sans text-sm text-white/75">
                                {bankGateway.instructions || t("payment_modal_bank_subtitle")}
                              </p>

                              {bankAccounts.length > 0 ? (
                                <div className="mt-4 space-y-2">
                                  <p className="font-sans text-xs font-semibold tracking-[0.08em] text-white/45 uppercase">
                                    {t("payment_modal_bank_accounts_label")}
                                  </p>
                                  {bankAccounts.map((account) => (
                                    <div
                                      key={`${account.bank}-${account.accountNumber}`}
                                      className="rounded-xl border border-[#2A2A2A] bg-black px-3 py-3"
                                    >
                                      <p className="font-sans text-sm font-semibold text-white">
                                        {account.accountName}
                                      </p>
                                      <p className="mt-1 font-sans text-sm text-white/75">
                                        {account.bank}
                                      </p>
                                      <p className="mt-1 font-sans text-base font-semibold tracking-wide text-[#9fd0ff]">
                                        {account.accountNumber}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            {!showBankReceiptForm ? (
                              <button
                                type="button"
                                onClick={() => setShowBankReceiptForm(true)}
                                className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                              >
                                <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                                {t("payment_modal_bank_payment_done")}
                              </button>
                            ) : (
                              <div className="space-y-3">
                                <p className="font-sans text-sm font-semibold text-white">
                                  {t("payment_modal_bank_form_title")}
                                </p>

                                <input
                                  type="text"
                                  value={bankFullName}
                                  onChange={(event) => setBankFullName(event.target.value)}
                                  placeholder={t("payment_modal_form_full_name")}
                                  aria-label={t("payment_modal_form_full_name")}
                                  className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                                />
                                <input
                                  type="email"
                                  value={bankEmail}
                                  onChange={(event) => setBankEmail(event.target.value)}
                                  placeholder={t("payment_modal_form_email")}
                                  aria-label={t("payment_modal_form_email")}
                                  className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                                />
                                <input
                                  type="tel"
                                  value={bankPhone}
                                  onChange={(event) => setBankPhone(event.target.value)}
                                  placeholder={t("payment_modal_form_phone")}
                                  aria-label={t("payment_modal_form_phone")}
                                  className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                                />

                                <label className="block">
                                  <span className="mb-2 block font-sans text-sm font-medium text-white">
                                    {t("payment_modal_bank_receipt_label")}
                                  </span>
                                  <input
                                    type="file"
                                    accept=".pdf,image/jpeg,image/png"
                                    onChange={(event) =>
                                      handleReceiptFileChange(
                                        event.currentTarget.files?.[0] ?? null
                                      )
                                    }
                                    className="min-h-11 w-full cursor-pointer rounded-xl border border-[#2A2A2A] bg-black px-4 py-2 font-sans text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-[#007eff] file:px-3 file:py-1 file:font-sans file:text-xs file:font-semibold file:text-white hover:border-[#007eff]"
                                  />
                                </label>

                                <p className="font-sans text-xs text-white/50">
                                  {t("payment_modal_bank_receipt_help")}
                                </p>
                                {bankReceiptFile ? (
                                  <p className="font-sans text-xs text-[#9fd0ff]">
                                    {t("payment_modal_bank_receipt_selected", {
                                      fileName: bankReceiptFile.name,
                                    })}
                                  </p>
                                ) : null}
                                {bankReceiptError ? (
                                  <p className="font-sans text-xs text-red-400">
                                    {bankReceiptError}
                                  </p>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={submitBankPayment}
                                  disabled={!isBankFormComplete || bankTransferMutation.isPending}
                                  className={cn(
                                    "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-5 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                                    !isBankFormComplete || bankTransferMutation.isPending
                                      ? "cursor-not-allowed border border-[#2A2A2A] bg-[#121212] text-white/45"
                                      : "bg-[#007eff] text-white hover:brightness-110"
                                  )}
                                >
                                  {bankTransferMutation.isPending ? (
                                    <>
                                      <Loader2
                                        className="mr-2 size-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                      {t("payment_modal_loading")}
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                                      {t("payment_modal_bank_send_receipt")}
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
