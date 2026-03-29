"use client";

import type { BookReprintConfigResponse } from "@bookprinta/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  Layers,
  LoaderCircle,
  Minus,
  Palette,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardErrorState } from "@/components/dashboard/dashboard-async-primitives";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { bookReprintConfigQueryKeys } from "@/hooks/use-book-reprint-config";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ordersQueryKeys } from "@/hooks/useOrders";
import {
  isReprintBankTransferResponse,
  type PaymentGateway,
  payReprint,
  uploadReprintBankTransferReceipt,
  usePaymentGateways,
  verifyPayment,
} from "@/hooks/usePayments";
import { userBooksQueryKeys } from "@/hooks/useUserBooks";
import { redirectToUrl } from "@/lib/browser-navigation";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────── */
/*  Types                                                 */
/* ────────────────────────────────────────────────────── */

type ReprintUnavailableReason = NonNullable<BookReprintConfigResponse["disableReason"]>;

type ReprintSameModalProps = {
  bookTitle?: string | null;
  config: BookReprintConfigResponse | null;
  errorMessage?: string | null;
  isError: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
  open: boolean;
  /** When set, the modal opens directly in payment-success state (Paystack callback). */
  paymentCallbackReference?: string | null;
  returnFocusElement?: HTMLElement | null;
};

type ModalStep =
  | "details"
  | "payment_method"
  | "online_processing"
  | "online_success"
  | "online_error"
  | "bank_details"
  | "bank_receipt"
  | "bank_confirmation";

type BankAccount = {
  accountName: string;
  accountNumber: string;
  bank: string;
};

type SelectedProvider = "PAYSTACK" | "STRIPE" | "BANK_TRANSFER";

/* ────────────────────────────────────────────────────── */
/*  Constants                                             */
/* ────────────────────────────────────────────────────── */

const MOTION_EASE = [0.22, 1, 0.36, 1] as const;
const MIN_COPIES = 25;
const DEFAULT_COPIES = 25;
const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
const RECEIPT_ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

/* ────────────────────────────────────────────────────── */
/*  Helpers                                               */
/* ────────────────────────────────────────────────────── */

function resolveLocaleTag(locale: string): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-NG";
}

function formatCurrency(value: number, locale: string, currency = "NGN"): string {
  return new Intl.NumberFormat(resolveLocaleTag(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(resolveLocaleTag(locale)).format(value);
}

function clampCopies(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_COPIES) return MIN_COPIES;
  return parsed;
}

function resolveUnavailableMessageKey(reason: ReprintUnavailableReason | null | undefined): string {
  switch (reason) {
    case "FINAL_PDF_MISSING":
      return "reprint_same_unavailable_final_pdf";
    case "PAGE_COUNT_UNAVAILABLE":
      return "reprint_same_unavailable_page_count";
    case "REPRINT_IN_PROGRESS":
      return "reprint_same_unavailable_in_progress";
    default:
      return "reprint_same_unavailable_generic";
  }
}

function parseBankAccounts(bankDetails: Record<string, unknown> | null): BankAccount[] {
  if (!bankDetails || typeof bankDetails !== "object") return [];
  const rawAccounts = bankDetails.accounts;
  if (!Array.isArray(rawAccounts)) return [];

  return rawAccounts
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const rec = entry as Record<string, unknown>;
      const accountName = typeof rec.accountName === "string" ? rec.accountName : "";
      const accountNumber = typeof rec.accountNumber === "string" ? rec.accountNumber : "";
      const bank = typeof rec.bank === "string" ? rec.bank : "";
      if (!accountName || !accountNumber || !bank) return null;
      return { accountName, accountNumber, bank };
    })
    .filter((entry): entry is BankAccount => entry !== null);
}

function capitalize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ────────────────────────────────────────────────────── */
/*  Motion presets (exported for tests)                   */
/* ────────────────────────────────────────────────────── */

export function getReprintSameModalMotionProps(prefersReducedMotion: boolean, isMobile: boolean) {
  if (prefersReducedMotion) {
    return {
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 },
        animate: isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 },
        exit: isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 },
        transition: { duration: 0 },
      },
    };
  }

  return {
    overlay: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.18, ease: "easeOut" as const },
    },
    panel: isMobile
      ? {
          initial: { y: "100%" },
          animate: { y: 0 },
          exit: { y: "100%" },
          transition: { duration: 0.28, ease: MOTION_EASE },
        }
      : {
          initial: { opacity: 0, scale: 0.96, y: 18 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.98, y: 12 },
          transition: { duration: 0.26, ease: MOTION_EASE },
        },
  };
}

/* ────────────────────────────────────────────────────── */
/*  Sub-component: CopyField (bank details)               */
/* ────────────────────────────────────────────────────── */

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API not available — no-op */
    }
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2A2A2A] bg-[#050505] px-4 py-3">
      <div className="min-w-0">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
          {label}
        </p>
        <p className="mt-0.5 font-sans text-sm font-semibold text-white break-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] text-white/70 transition-colors duration-150 hover:border-[#007eff] hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      >
        {copied ? (
          <Check className="size-4 text-emerald-400" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────── */
/*  Main modal component                                  */
/* ────────────────────────────────────────────────────── */

export function ReprintSameModal({
  bookTitle,
  config,
  errorMessage,
  isError,
  isLoading,
  onOpenChange,
  onRetry,
  open,
  paymentCallbackReference,
  returnFocusElement,
}: ReprintSameModalProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tCheckout = useTranslations("checkout");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;
  const prefersReducedMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  /* ── State ── */
  const [step, setStep] = useState<ModalStep>("details");
  const [slideDirection, setSlideDirection] = useState(1);
  const [copiesInput, setCopiesInput] = useState(String(DEFAULT_COPIES));
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /* ── Bank transfer state ── */
  const [bankAmount, setBankAmount] = useState(0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankEmail, setBankEmail] = useState("");
  const [bankPhone, setBankPhone] = useState("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  const {
    data: paymentGateways,
    isError: isPaymentGatewaysError,
    isLoading: isPaymentGatewaysLoading,
    refetch: refetchPaymentGateways,
  } = usePaymentGateways(open && config?.canReprintSame === true);

  const motionProps = getReprintSameModalMotionProps(prefersReducedMotion, isMobile);

  /* ── Reset on open/close ── */
  useEffect(() => {
    if (!open) return;
    setStep(paymentCallbackReference ? "online_success" : "details");
    setSlideDirection(1);
    setCopiesInput(String(DEFAULT_COPIES));
    setPaymentError(null);
    setIsProcessing(false);
    setBankAmount(0);
    setReceiptFile(null);
    setReceiptError(null);
    setBankName(user?.firstName ?? "");
    setBankEmail(user?.email ?? "");
    setBankPhone("");
    setIsUploadingReceipt(false);
  }, [open, paymentCallbackReference, user?.firstName, user?.email]);

  /* ── Invalidate caches after successful reprint payment ── */
  useEffect(() => {
    if (step !== "online_success" && step !== "bank_confirmation") return;
    const bookId = config?.bookId;
    if (bookId) {
      queryClient.invalidateQueries({ queryKey: bookReprintConfigQueryKeys.detail(bookId) });
    }
    queryClient.invalidateQueries({ queryKey: userBooksQueryKeys.all });
    queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
  }, [step, config?.bookId, queryClient]);

  /* ── Verify payment after Paystack redirect (ensures entity creation) ── */
  useEffect(() => {
    if (!paymentCallbackReference || step !== "online_success") return;
    let cancelled = false;
    verifyPayment(paymentCallbackReference)
      .then(() => {
        if (cancelled) return;
        const bookId = config?.bookId;
        if (bookId) {
          queryClient.invalidateQueries({ queryKey: bookReprintConfigQueryKeys.detail(bookId) });
        }
        queryClient.invalidateQueries({ queryKey: userBooksQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
      })
      .catch(() => {
        /* Verification is best-effort; webhook may still process it */
      });
    return () => {
      cancelled = true;
    };
  }, [paymentCallbackReference, step, config?.bookId, queryClient]);

  /* ── Computed values ── */
  const effectiveCopies = clampCopies(copiesInput);
  const costPerCopy = config?.costPerCopy ?? 0;
  const totalPrice = costPerCopy * effectiveCopies;
  const isPaymentCallbackSuccess = step === "online_success" || step === "bank_confirmation";
  const showUnavailableState =
    !isLoading &&
    !isError &&
    config !== null &&
    !config.canReprintSame &&
    !isPaymentCallbackSuccess;

  const bankGateway = useMemo(
    () => (paymentGateways ?? []).find((g) => g.provider === "BANK_TRANSFER" && g.isEnabled),
    [paymentGateways]
  );

  const bankAccounts = useMemo(
    () => parseBankAccounts(bankGateway?.bankDetails ?? null),
    [bankGateway?.bankDetails]
  );

  const availableProviders = useMemo<
    {
      provider: SelectedProvider;
      label: string;
      icon: typeof CreditCard;
      gateway: PaymentGateway;
    }[]
  >(() => {
    if (!paymentGateways) return [];
    const result: {
      provider: SelectedProvider;
      label: string;
      icon: typeof CreditCard;
      gateway: PaymentGateway;
    }[] = [];

    for (const gw of paymentGateways) {
      if (!gw.isEnabled) continue;
      if (gw.provider === "PAYSTACK") {
        result.push({
          provider: "PAYSTACK",
          label: tDashboard("reprint_pay_with_paystack"),
          icon: CreditCard,
          gateway: gw,
        });
      } else if (gw.provider === "STRIPE") {
        result.push({
          provider: "STRIPE",
          label: tDashboard("reprint_pay_with_stripe"),
          icon: CreditCard,
          gateway: gw,
        });
      } else if (gw.provider === "BANK_TRANSFER") {
        result.push({
          provider: "BANK_TRANSFER",
          label: tDashboard("reprint_pay_bank_transfer"),
          icon: Landmark,
          gateway: gw,
        });
      }
    }
    return result;
  }, [paymentGateways, tDashboard]);

  /* ── Navigation ── */
  const goTo = useCallback((next: ModalStep, direction: 1 | -1 = 1) => {
    setSlideDirection(direction);
    setStep(next);
  }, []);

  /* ── Copies handlers ── */
  const handleCopiesChange = (value: string) => {
    if (!/^\d*$/.test(value)) return;
    setCopiesInput(value);
  };

  const handleCopiesBlur = () => {
    setCopiesInput(String(clampCopies(copiesInput)));
  };

  const handleCopiesStep = (direction: "decrease" | "increase") => {
    const nextValue =
      direction === "decrease" ? Math.max(MIN_COPIES, effectiveCopies - 1) : effectiveCopies + 1;
    setCopiesInput(String(nextValue));
  };

  /* ── Payment: online (Paystack/Stripe) ── */
  const handleOnlinePayment = async (provider: "PAYSTACK" | "STRIPE") => {
    if (!config || isOffline) {
      setPaymentError(isOffline ? tCommon("offline_banner") : null);
      return;
    }

    setPaymentError(null);
    setIsProcessing(true);
    goTo("online_processing");

    try {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const response = await payReprint({
        sourceBookId: config.bookId,
        copies: effectiveCopies,
        provider,
        ...(callbackUrl ? { callbackUrl } : {}),
      });

      if (isReprintBankTransferResponse(response)) {
        throw new Error(tDashboard("reprint_same_payment_error"));
      }

      if (!response.authorizationUrl) {
        throw new Error(tDashboard("reprint_same_payment_error"));
      }

      redirectToUrl(response.authorizationUrl);
    } catch (error) {
      setPaymentError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : tDashboard("reprint_same_payment_error")
      );
      setIsProcessing(false);
      goTo("online_error");
    }
  };

  /* ── Payment: bank transfer ── */
  const handleBankTransfer = () => {
    if (!config || isOffline) {
      setPaymentError(isOffline ? tCommon("offline_banner") : null);
      return;
    }

    setPaymentError(null);
    // No API call here — Payment record is created only when receipt is submitted.
    // Bank account details come from paymentGateways; amount is computed client-side.
    goTo("bank_details");
  };

  /* ── Provider selection ── */
  const handleProviderSelect = (provider: SelectedProvider) => {
    if (provider === "BANK_TRANSFER") {
      void handleBankTransfer();
    } else {
      void handleOnlinePayment(provider);
    }
  };

  /* ── Receipt file handling ── */
  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReceiptError(null);
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setReceiptFile(null);
      return;
    }

    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setReceiptError(tCheckout("payment_modal_bank_receipt_too_large"));
      setReceiptFile(null);
      return;
    }

    if (!RECEIPT_ALLOWED_TYPES.has(file.type)) {
      setReceiptError(tCheckout("payment_modal_bank_receipt_invalid_type"));
      setReceiptFile(null);
      return;
    }

    setReceiptFile(file);
  };

  /* ── Receipt submission ── */
  const handleReceiptSubmit = async () => {
    if (!config || !receiptFile || isUploadingReceipt) return;

    setIsUploadingReceipt(true);
    setPaymentError(null);

    try {
      // Step 1: Create the Payment record now (deferred from provider selection)
      const response = await payReprint({
        sourceBookId: config.bookId,
        copies: effectiveCopies,
        provider: "BANK_TRANSFER",
      });

      if (!isReprintBankTransferResponse(response)) {
        throw new Error(tDashboard("reprint_same_payment_error"));
      }

      const paymentId = response.paymentId;
      setBankAmount(response.amount);

      // Step 2: Immediately upload the receipt to the newly created Payment
      await uploadReprintBankTransferReceipt({
        paymentId,
        payerName: bankName.trim() || user?.firstName || "",
        payerEmail: bankEmail.trim() || user?.email || "",
        payerPhone: bankPhone.trim(),
        receiptFile,
      });

      goTo("bank_confirmation");
    } catch (error) {
      setPaymentError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : tDashboard("reprint_same_payment_error")
      );
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  /* ── Retry helpers ── */
  const handleRetry = () => onRetry?.();

  /* ────────────────────────────────────────────────── */
  /*  Render                                            */
  /* ────────────────────────────────────────────────── */

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence initial={false}>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={motionProps.overlay.initial}
                animate={motionProps.overlay.animate}
                exit={motionProps.overlay.exit}
                transition={motionProps.overlay.transition}
                className="fixed inset-0 z-50 bg-black/84 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              forceMount
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                closeButtonRef.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusElement?.focus();
              }}
            >
              <motion.section
                data-testid="reprint-same-modal-shell"
                data-motion-layout={isMobile ? "mobile-sheet" : "desktop-modal"}
                initial={motionProps.panel.initial}
                animate={motionProps.panel.animate}
                exit={motionProps.panel.exit}
                transition={motionProps.panel.transition}
                data-lenis-prevent
                className={
                  isMobile
                    ? "fixed inset-0 z-50 flex items-stretch justify-center outline-none"
                    : "fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-6"
                }
              >
                <div
                  data-testid="reprint-same-modal"
                  className={cn(
                    "relative flex w-full flex-col overflow-hidden border border-[#2A2A2A] bg-[#000000] text-white shadow-[0_32px_96px_rgba(0,0,0,0.72)]",
                    isMobile
                      ? "h-full"
                      : "max-h-[min(88dvh,920px)] max-w-[min(640px,calc(100%-2rem))] rounded-[34px]"
                  )}
                >
                  {/* Accent gradient */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(72% 58% at 16% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 76%)",
                    }}
                  />

                  <div className="relative z-10 flex h-full min-h-0 flex-col px-5 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                    {/* Close button */}
                    <button
                      ref={closeButtonRef}
                      type="button"
                      onClick={() => onOpenChange(false)}
                      aria-label={tDashboard("reprint_same_close_aria")}
                      className="absolute right-4 top-4 z-20 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>

                    {/* Header */}
                    <header className="pr-14">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-[#007eff]">
                        {tDashboard("reprint_same")}
                      </p>
                      <DialogPrimitive.Title className="font-display mt-4 text-[1.75rem] leading-[1.06] font-semibold tracking-tight text-white sm:text-[2rem]">
                        {tDashboard("reprint_same_modal_title")}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="sr-only">
                        {tDashboard("reprint_same_modal_description")}
                      </DialogPrimitive.Description>
                    </header>

                    {/* Content area */}
                    <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto pr-0 md:pr-1">
                      {/* ── Loading ── */}
                      {isLoading ? (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center">
                          <LoaderCircle
                            className="size-8 animate-spin text-[#007eff]"
                            aria-hidden="true"
                          />
                          <p className="font-display mt-5 text-xl font-semibold text-white">
                            {tDashboard("reprint_same_loading_title")}
                          </p>
                          <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                            {tDashboard("reprint_same_loading_description")}
                          </p>
                        </div>
                      ) : isError ? (
                        /* ── Error ── */
                        <DashboardErrorState
                          className="flex-1 rounded-[30px] border-[#2A2A2A] bg-[#050505]"
                          title={tDashboard("reprint_same_load_error_title")}
                          description={
                            errorMessage || tDashboard("reprint_same_load_error_description")
                          }
                          retryLabel={tCommon("retry")}
                          loadingLabel={tCommon("loading")}
                          onRetry={handleRetry}
                        />
                      ) : showUnavailableState ? (
                        /* ── Unavailable state ── */
                        <div className="flex flex-1 flex-col justify-between gap-6 rounded-[30px] border border-[#2A2A2A] bg-[#050505] p-5 sm:p-6">
                          <div>
                            <p className="font-display text-xl font-semibold text-white">
                              {tDashboard("reprint_same_unavailable_title")}
                            </p>
                            <p className="font-sans mt-3 max-w-xl text-sm leading-6 text-[#BDBDBD]">
                              {tDashboard(resolveUnavailableMessageKey(config?.disableReason))}
                            </p>
                          </div>
                          <div className="rounded-[28px] border border-[#2A2A2A] bg-[#000000] p-4">
                            <p className="font-sans text-sm text-[#BDBDBD]">
                              {tDashboard("reprint_same_contact_support_prefix")}{" "}
                              <Link
                                href="/contact"
                                className="font-semibold text-[#007eff] underline decoration-[#007eff]/45 underline-offset-4 transition-colors duration-150 hover:text-[#47a6ff]"
                              >
                                {tDashboard("reprint_same_contact_support")}
                              </Link>
                            </p>
                          </div>
                        </div>
                      ) : config ? (
                        /* ── Step-based flow ── */
                        <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
                          {/* ═══════ STEP 1: Reprint Details ═══════ */}
                          {step === "details" ? (
                            <motion.div
                              key="details"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="space-y-4 pb-4"
                            >
                              {/* Read-only book info */}
                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                                  {tDashboard("reprint_same_source_book_label")}
                                </p>
                                <p className="font-display mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                  {config.bookTitle ||
                                    bookTitle ||
                                    tDashboard("book_progress_meta_value_unavailable")}
                                </p>

                                <dl className="mt-4 grid grid-cols-2 gap-3">
                                  <div className="rounded-2xl border border-[#2A2A2A] bg-[#000000] px-3.5 py-3">
                                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                      <BookOpen
                                        className="mr-1.5 inline-block size-3.5 text-[#007eff]"
                                        aria-hidden="true"
                                      />
                                      {tDashboard("reprint_detail_pages")}
                                    </dt>
                                    <dd className="mt-1 font-sans text-sm font-semibold text-white">
                                      {config.pageCount !== null
                                        ? tDashboard("reprint_same_page_count", {
                                            count: formatInteger(config.pageCount, locale),
                                          })
                                        : "—"}
                                    </dd>
                                  </div>
                                  <div className="rounded-2xl border border-[#2A2A2A] bg-[#000000] px-3.5 py-3">
                                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                      <Layers
                                        className="mr-1.5 inline-block size-3.5 text-[#007eff]"
                                        aria-hidden="true"
                                      />
                                      {tDashboard("reprint_detail_size")}
                                    </dt>
                                    <dd className="mt-1 font-sans text-sm font-semibold text-white">
                                      {config.bookSize?.toUpperCase() ?? "—"}
                                    </dd>
                                  </div>
                                  <div className="rounded-2xl border border-[#2A2A2A] bg-[#000000] px-3.5 py-3">
                                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                      <Palette
                                        className="mr-1.5 inline-block size-3.5 text-[#007eff]"
                                        aria-hidden="true"
                                      />
                                      {tDashboard("reprint_detail_paper")}
                                    </dt>
                                    <dd className="mt-1 font-sans text-sm font-semibold text-white">
                                      {capitalize(config.paperColor)}
                                    </dd>
                                  </div>
                                  <div className="rounded-2xl border border-[#2A2A2A] bg-[#000000] px-3.5 py-3">
                                    <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                      <Layers
                                        className="mr-1.5 inline-block size-3.5 text-[#007eff]"
                                        aria-hidden="true"
                                      />
                                      {tDashboard("reprint_detail_lamination")}
                                    </dt>
                                    <dd className="mt-1 font-sans text-sm font-semibold text-white">
                                      {capitalize(config.lamination)}
                                    </dd>
                                  </div>
                                </dl>
                              </div>

                              {/* Copies input */}
                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <label
                                  htmlFor="reprint-same-copies"
                                  className="font-sans text-sm font-semibold text-white"
                                >
                                  {tDashboard("copies")}
                                </label>
                                <div className="mt-3 flex items-center gap-3">
                                  <button
                                    type="button"
                                    aria-controls="reprint-same-copies"
                                    aria-label={tDashboard("reprint_same_decrease_copies")}
                                    onClick={() => handleCopiesStep("decrease")}
                                    disabled={effectiveCopies <= MIN_COPIES}
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#071320] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:border-[#2A2A2A] disabled:hover:bg-[#000000]"
                                  >
                                    <Minus className="size-4" aria-hidden="true" />
                                  </button>

                                  <input
                                    id="reprint-same-copies"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min={MIN_COPIES}
                                    type="text"
                                    value={copiesInput}
                                    onChange={(event) => handleCopiesChange(event.target.value)}
                                    onBlur={handleCopiesBlur}
                                    className="font-display min-h-12 w-full rounded-full border border-[#2A2A2A] bg-[#000000] px-5 text-center text-2xl font-semibold text-white outline-none transition-colors duration-150 placeholder:text-[#6F6F6F] focus:border-[#007eff]"
                                    aria-describedby="reprint-same-copies-helper"
                                  />

                                  <button
                                    type="button"
                                    aria-controls="reprint-same-copies"
                                    aria-label={tDashboard("reprint_same_increase_copies")}
                                    onClick={() => handleCopiesStep("increase")}
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#071320] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                                  >
                                    <Plus className="size-4" aria-hidden="true" />
                                  </button>
                                </div>
                                <p
                                  id="reprint-same-copies-helper"
                                  className="font-sans mt-3 text-sm text-[#BDBDBD]"
                                >
                                  {tDashboard("reprint_same_min_copies", {
                                    count: formatInteger(MIN_COPIES, locale),
                                  })}
                                </p>
                              </div>

                              {/* Live total */}
                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                                  {tDashboard("reprint_same_live_price_label")}
                                </p>
                                <p
                                  className="font-display mt-3 text-[2.4rem] leading-none font-semibold tracking-tight text-[#007eff] sm:text-[3rem]"
                                  aria-live="polite"
                                >
                                  {formatCurrency(totalPrice, locale)}
                                </p>
                                <p className="font-sans mt-3 text-sm leading-6 text-[#BDBDBD]">
                                  {tDashboard("reprint_cost_breakdown", {
                                    costPerCopy: formatCurrency(costPerCopy, locale),
                                    copies: formatInteger(effectiveCopies, locale),
                                  })}
                                </p>
                              </div>

                              {/* Offline warning */}
                              {isOffline ? (
                                <p
                                  aria-live="polite"
                                  className="font-sans rounded-[20px] border border-[#2A2A2A] bg-[#050505] px-4 py-3 text-sm leading-6 text-[#d0d0d0]"
                                >
                                  {tCommon("offline_banner")}
                                </p>
                              ) : null}

                              {/* Pay CTA */}
                              <Button
                                type="button"
                                onClick={() => goTo("payment_method")}
                                disabled={
                                  isOffline || totalPrice <= 0 || effectiveCopies < MIN_COPIES
                                }
                                className="font-sans inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#007eff] px-6 text-base font-semibold text-white transition-colors duration-150 hover:bg-[#0a72df] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-[#007eff]/40 disabled:text-white/50"
                              >
                                {tDashboard("reprint_pay_cta")}
                              </Button>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 2: Payment Method Selection ═══════ */}
                          {step === "payment_method" ? (
                            <motion.div
                              key="payment_method"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="space-y-4 pb-4"
                            >
                              <button
                                type="button"
                                onClick={() => goTo("details", -1)}
                                className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                {tCommon("back")}
                              </button>

                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <p className="font-display text-xl font-semibold text-white">
                                  {tDashboard("reprint_choose_payment")}
                                </p>
                                <p className="font-sans mt-2 text-sm leading-6 text-[#BDBDBD]">
                                  {tDashboard("reprint_choose_payment_desc")}
                                </p>

                                {isPaymentGatewaysLoading ? (
                                  <div className="mt-5 flex items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#050505] px-4 py-3">
                                    <LoaderCircle
                                      className="size-4 animate-spin text-[#007eff]"
                                      aria-hidden="true"
                                    />
                                    <span className="font-sans text-sm text-[#BDBDBD]">
                                      {tDashboard("reprint_same_payment_gateways_loading")}
                                    </span>
                                  </div>
                                ) : isPaymentGatewaysError ? (
                                  <div className="mt-5 rounded-[20px] border border-[#2A2A2A] bg-[#050505] p-4">
                                    <p className="font-sans text-sm leading-6 text-[#BDBDBD]">
                                      {tDashboard("reprint_same_payment_gateways_error")}
                                    </p>
                                    <Button
                                      type="button"
                                      onClick={() => void refetchPaymentGateways()}
                                      className="font-sans mt-3 min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
                                    >
                                      {tDashboard("reprint_same_payment_retry")}
                                    </Button>
                                  </div>
                                ) : availableProviders.length > 0 ? (
                                  <div className="mt-5 grid gap-3">
                                    {availableProviders.map(({ provider, label, icon: Icon }) => (
                                      <button
                                        key={provider}
                                        type="button"
                                        onClick={() => handleProviderSelect(provider)}
                                        disabled={isProcessing}
                                        className="group inline-flex min-h-[4.25rem] w-full items-center gap-4 rounded-2xl border border-[#2A2A2A] bg-[#000000] px-5 py-4 text-left transition-all duration-150 hover:border-[#007eff] hover:bg-[#071320] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#050505] text-[#007eff] transition-colors duration-150 group-hover:border-[#007eff]/50">
                                          <Icon className="size-5" aria-hidden="true" />
                                        </span>
                                        <span className="font-sans text-sm font-semibold text-white">
                                          {label}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="font-sans mt-5 text-sm leading-6 text-[#BDBDBD]">
                                    {tDashboard("reprint_same_unavailable_payment_provider")}
                                  </p>
                                )}

                                {paymentError ? (
                                  <p
                                    role="alert"
                                    className="font-sans mt-4 rounded-[18px] border border-[#ef4444]/45 bg-[#111111] px-4 py-3 text-sm leading-6 text-[#f3b2b2]"
                                  >
                                    {paymentError}
                                  </p>
                                ) : null}
                              </div>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3a: Online Processing (spinner) ═══════ */}
                          {step === "online_processing" ? (
                            <motion.div
                              key="online_processing"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center"
                            >
                              <LoaderCircle
                                className="size-10 animate-spin text-[#007eff]"
                                aria-hidden="true"
                              />
                              <p className="font-display mt-5 text-xl font-semibold text-white">
                                {tDashboard("reprint_same_payment_processing")}
                              </p>
                              <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                                {tDashboard("reprint_redirecting_desc")}
                              </p>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3a: Online Error ═══════ */}
                          {step === "online_error" ? (
                            <motion.div
                              key="online_error"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center"
                            >
                              <div className="flex size-14 items-center justify-center rounded-full border border-[#ef4444]/30 bg-[#1a0505]">
                                <X className="size-6 text-[#ef4444]" aria-hidden="true" />
                              </div>
                              <p className="font-display mt-5 text-xl font-semibold text-white">
                                {tDashboard("reprint_same_payment_error")}
                              </p>
                              {paymentError ? (
                                <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                                  {paymentError}
                                </p>
                              ) : null}
                              <Button
                                type="button"
                                onClick={() => goTo("payment_method", -1)}
                                className="font-sans mt-6 min-h-11 rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df]"
                              >
                                {tCommon("retry")}
                              </Button>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3b-1: Bank Details ═══════ */}
                          {step === "bank_details" ? (
                            <motion.div
                              key="bank_details"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="space-y-4 pb-4"
                            >
                              <button
                                type="button"
                                onClick={() => goTo("payment_method", -1)}
                                className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                {tCommon("back")}
                              </button>

                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <p className="font-display text-xl font-semibold text-white">
                                  {tDashboard("reprint_bank_title")}
                                </p>

                                {/* Amount to transfer */}
                                <div className="mt-4 rounded-2xl border border-[#007eff]/30 bg-[#071320] p-4 text-center">
                                  <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                                    {tDashboard("reprint_bank_amount_label")}
                                  </p>
                                  <p className="font-display mt-2 text-[2rem] font-semibold tracking-tight text-[#007eff]">
                                    {formatCurrency(bankAmount || totalPrice, locale)}
                                  </p>
                                </div>

                                {/* Bank accounts */}
                                {bankAccounts.length > 0 ? (
                                  <div className="mt-4 space-y-3">
                                    {bankAccounts.map((account, index) => (
                                      <div
                                        key={`${account.bank}-${account.accountNumber}`}
                                        className="space-y-2"
                                      >
                                        {index > 0 ? (
                                          <div className="border-t border-[#2A2A2A]" />
                                        ) : null}
                                        <CopyField
                                          label={tCheckout("payment_modal_bank_name")}
                                          value={account.bank}
                                        />
                                        <CopyField
                                          label={tCheckout("payment_modal_bank_account_number")}
                                          value={account.accountNumber}
                                        />
                                        <CopyField
                                          label={tCheckout("payment_modal_bank_account_name")}
                                          value={account.accountName}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="font-sans mt-4 text-sm text-[#BDBDBD]">
                                    {tDashboard("reprint_bank_no_accounts")}
                                  </p>
                                )}
                              </div>

                              <Button
                                type="button"
                                onClick={() => goTo("bank_receipt")}
                                className="font-sans inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#007eff] px-6 text-base font-semibold text-white transition-colors duration-150 hover:bg-[#0a72df] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                {tCheckout("transfer_done")}
                              </Button>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3b-2: Receipt Upload ═══════ */}
                          {step === "bank_receipt" ? (
                            <motion.div
                              key="bank_receipt"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="space-y-4 pb-4"
                            >
                              <button
                                type="button"
                                onClick={() => goTo("bank_details", -1)}
                                className="font-sans inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#9FD0FF] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                {tCommon("back")}
                              </button>

                              <div className="rounded-[24px] border border-[#2A2A2A] bg-[#050505] p-5">
                                <p className="font-display text-xl font-semibold text-white">
                                  {tCheckout("payment_modal_bank_form_title")}
                                </p>

                                {/* Name */}
                                <div className="mt-5 space-y-1.5">
                                  <label
                                    htmlFor="reprint-bank-name"
                                    className="font-sans text-sm font-semibold text-white"
                                  >
                                    {tCheckout("full_name")}
                                  </label>
                                  <input
                                    id="reprint-bank-name"
                                    type="text"
                                    value={bankName}
                                    onChange={(e) => setBankName(e.target.value)}
                                    className="font-sans min-h-12 w-full rounded-2xl border border-[#2A2A2A] bg-[#000000] px-4 text-sm text-white outline-none transition-colors duration-150 placeholder:text-[#6F6F6F] focus:border-[#007eff]"
                                  />
                                </div>

                                {/* Email */}
                                <div className="mt-4 space-y-1.5">
                                  <label
                                    htmlFor="reprint-bank-email"
                                    className="font-sans text-sm font-semibold text-white"
                                  >
                                    {tCheckout("email")}
                                  </label>
                                  <input
                                    id="reprint-bank-email"
                                    type="email"
                                    value={bankEmail}
                                    onChange={(e) => setBankEmail(e.target.value)}
                                    className="font-sans min-h-12 w-full rounded-2xl border border-[#2A2A2A] bg-[#000000] px-4 text-sm text-white outline-none transition-colors duration-150 placeholder:text-[#6F6F6F] focus:border-[#007eff]"
                                  />
                                </div>

                                {/* Phone */}
                                <div className="mt-4 space-y-1.5">
                                  <label
                                    htmlFor="reprint-bank-phone"
                                    className="font-sans text-sm font-semibold text-white"
                                  >
                                    {tCheckout("phone")}
                                  </label>
                                  <input
                                    id="reprint-bank-phone"
                                    type="tel"
                                    value={bankPhone}
                                    onChange={(e) => setBankPhone(e.target.value)}
                                    className="font-sans min-h-12 w-full rounded-2xl border border-[#2A2A2A] bg-[#000000] px-4 text-sm text-white outline-none transition-colors duration-150 placeholder:text-[#6F6F6F] focus:border-[#007eff]"
                                  />
                                </div>

                                {/* Receipt upload */}
                                <div className="mt-5 space-y-1.5">
                                  <label
                                    htmlFor="reprint-bank-receipt"
                                    className="font-sans text-sm font-semibold text-white"
                                  >
                                    {tCheckout("payment_modal_bank_receipt_label")}
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => receiptInputRef.current?.click()}
                                    className={cn(
                                      "flex min-h-[5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-4 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
                                      receiptFile
                                        ? "border-[#007eff]/50 bg-[#071320]"
                                        : "border-[#2A2A2A] bg-[#000000] hover:border-[#007eff]/40 hover:bg-[#050505]"
                                    )}
                                  >
                                    <Upload className="size-5 text-[#007eff]" aria-hidden="true" />
                                    <span className="font-sans text-sm text-[#BDBDBD]">
                                      {receiptFile
                                        ? tCheckout("payment_modal_bank_receipt_selected", {
                                            fileName: receiptFile.name,
                                          })
                                        : tCheckout("upload_receipt")}
                                    </span>
                                  </button>
                                  <input
                                    ref={receiptInputRef}
                                    id="reprint-bank-receipt"
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={handleReceiptChange}
                                    className="sr-only"
                                    aria-describedby="reprint-receipt-help"
                                  />
                                  <p
                                    id="reprint-receipt-help"
                                    className="font-sans text-xs text-[#8D8D8D]"
                                  >
                                    {tCheckout("payment_modal_bank_receipt_help")}
                                  </p>
                                  {receiptError ? (
                                    <p role="alert" className="font-sans text-xs text-[#ef4444]">
                                      {receiptError}
                                    </p>
                                  ) : null}
                                </div>

                                {/* Upload progress bar */}
                                {isUploadingReceipt ? (
                                  <div className="mt-4">
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2A2A2A]">
                                      <motion.div
                                        className="h-full rounded-full bg-[#007eff]"
                                        initial={{ width: "0%" }}
                                        animate={{ width: "85%" }}
                                        transition={{ duration: 2, ease: "easeOut" }}
                                      />
                                    </div>
                                    <p className="font-sans mt-2 text-xs text-[#BDBDBD]">
                                      {tDashboard("reprint_uploading_receipt")}
                                    </p>
                                  </div>
                                ) : null}

                                {paymentError ? (
                                  <p
                                    role="alert"
                                    className="font-sans mt-4 rounded-[18px] border border-[#ef4444]/45 bg-[#111111] px-4 py-3 text-sm leading-6 text-[#f3b2b2]"
                                  >
                                    {paymentError}
                                  </p>
                                ) : null}
                              </div>

                              <Button
                                type="button"
                                onClick={() => void handleReceiptSubmit()}
                                disabled={!receiptFile || isUploadingReceipt}
                                className="font-sans inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#007eff] px-6 text-base font-semibold text-white transition-colors duration-150 hover:bg-[#0a72df] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-[#007eff]/40 disabled:text-white/50"
                              >
                                {isUploadingReceipt ? (
                                  <>
                                    <LoaderCircle
                                      className="mr-2 size-4 animate-spin"
                                      aria-hidden="true"
                                    />
                                    {tCommon("loading")}
                                  </>
                                ) : (
                                  tCheckout("payment_modal_bank_send_receipt")
                                )}
                              </Button>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3b-3: Bank Confirmation ═══════ */}
                          {step === "bank_confirmation" ? (
                            <motion.div
                              key="bank_confirmation"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center"
                            >
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 20,
                                  delay: 0.1,
                                }}
                              >
                                <CheckCircle2
                                  className="size-14 text-emerald-400"
                                  aria-hidden="true"
                                />
                              </motion.div>
                              <p className="font-display mt-5 text-xl font-semibold text-white">
                                {tDashboard("reprint_bank_confirmation_title")}
                              </p>
                              <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                                {tCheckout("payment_verified")}
                              </p>
                              <Button
                                type="button"
                                onClick={() => {
                                  onOpenChange(false);
                                  router.push("/dashboard/books");
                                }}
                                className="font-sans mt-6 min-h-11 rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0066d1]"
                              >
                                {tDashboard("reprint_success_go_to_books")}
                              </Button>
                            </motion.div>
                          ) : null}

                          {/* ═══════ STEP 3a: Online Success ═══════ */}
                          {step === "online_success" ? (
                            <motion.div
                              key="online_success"
                              custom={slideDirection}
                              variants={SLIDE_VARIANTS}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.25,
                                ease: MOTION_EASE,
                              }}
                              className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center"
                            >
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 20,
                                  delay: 0.1,
                                }}
                              >
                                <CheckCircle2
                                  className="size-14 text-emerald-400"
                                  aria-hidden="true"
                                />
                              </motion.div>
                              <p className="font-display mt-5 text-xl font-semibold text-white">
                                {tDashboard("reprint_success_title")}
                              </p>
                              <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                                {tDashboard("reprint_success_desc")}
                              </p>
                              <Button
                                type="button"
                                onClick={() => {
                                  onOpenChange(false);
                                  router.push("/dashboard/books");
                                }}
                                className="font-sans mt-6 min-h-11 rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0066d1]"
                              >
                                {tDashboard("reprint_success_go_to_books")}
                              </Button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.section>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
