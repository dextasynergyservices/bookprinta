"use client";

import type { BookReprintConfigResponse } from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Check, Layers, LoaderCircle, Minus, Plus, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { DashboardErrorState } from "@/components/dashboard/dashboard-async-primitives";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { type PaymentGateway, payReprint, usePaymentGateways } from "@/hooks/usePayments";
import { redirectToUrl } from "@/lib/browser-navigation";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type ReprintBookSize = BookReprintConfigResponse["allowedBookSizes"][number];
type ReprintPaperColor = BookReprintConfigResponse["allowedPaperColors"][number];
type ReprintLamination = BookReprintConfigResponse["allowedLaminations"][number];
type ReprintUnavailableReason = NonNullable<BookReprintConfigResponse["disableReason"]>;
type ReprintPaymentProvider = Extract<
  BookReprintConfigResponse["enabledPaymentProviders"][number],
  "PAYSTACK" | "STRIPE"
>;
type InlineReprintPaymentGateway = PaymentGateway & { provider: ReprintPaymentProvider };

type GroupOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  swatchColor?: string;
  swatchBorder?: string;
};

type OptionGroupProps<T extends string> = {
  columns?: 2 | 3;
  icon: LucideIcon;
  id: string;
  label: string;
  onChange: (value: T) => void;
  options: GroupOption<T>[];
  value: T;
};

type ReprintSameModalProps = {
  bookTitle?: string | null;
  config: BookReprintConfigResponse | null;
  errorMessage?: string | null;
  isError: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
  open: boolean;
  returnFocusElement?: HTMLElement | null;
};

const MOTION_EASE = [0.22, 1, 0.36, 1] as const;
const SELECTION_TRANSITION = { type: "spring", stiffness: 430, damping: 34, mass: 0.65 } as const;

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

function clampCopies(value: string, minCopies: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minCopies) {
    return minCopies;
  }

  return parsed;
}

function resolveUnavailableMessageKey(reason: ReprintUnavailableReason | null | undefined): string {
  switch (reason) {
    case "FINAL_PDF_MISSING":
      return "reprint_same_unavailable_final_pdf";
    case "PAGE_COUNT_UNAVAILABLE":
      return "reprint_same_unavailable_page_count";
    case "BOOK_SIZE_UNSUPPORTED":
      return "reprint_same_unavailable_book_size";
    case "PAYMENT_PROVIDER_UNAVAILABLE":
      return "reprint_same_unavailable_payment_provider";
    default:
      return "reprint_same_unavailable_generic";
  }
}

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

function OptionGroup<T extends string>({
  columns = 2,
  icon: Icon,
  id,
  label,
  onChange,
  options,
  value,
}: OptionGroupProps<T>) {
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleArrowNavigation = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const isHorizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const isVertical = event.key === "ArrowUp" || event.key === "ArrowDown";

    if (!isHorizontal && !isVertical) return;

    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
    const nextOption = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-option-index="${nextIndex}"]`
    );
    nextOption?.focus();
  };

  return (
    <fieldset className="space-y-2.5">
      <legend id={`${id}-legend`} className="font-sans text-sm font-semibold text-white/90">
        <span className="inline-flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full border border-[#2A2A2A] bg-black/70 text-[#007eff]">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span>{label}</span>
        </span>
      </legend>

      <div
        role="radiogroup"
        aria-labelledby={`${id}-legend`}
        className={cn(
          "grid gap-2 rounded-[1.45rem] border border-[#2A2A2A] bg-[#050505] p-2",
          columns === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {options.map((option, index) => {
          const isSelected = value === option.value;
          const tabIndex = isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1;

          return (
            <motion.button
              key={option.value}
              type="button"
              data-option-index={index}
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              tabIndex={tabIndex}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleArrowNavigation(event, index)}
              layout
              transition={SELECTION_TRANSITION}
              animate={{ scale: isSelected ? 1 : 0.985 }}
              className={cn(
                "relative flex min-h-11 min-w-11 items-center justify-center gap-2 overflow-hidden rounded-[1rem] border px-3 py-3 text-center font-sans text-sm font-semibold transition-[color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                isSelected
                  ? "border-[#007eff] text-white shadow-[0_10px_28px_rgba(0,126,255,0.35)]"
                  : "border-[#2A2A2A] bg-[#050505] text-white/85 hover:border-[#007eff] hover:bg-[#0a0a0a]"
              )}
            >
              {isSelected ? (
                <motion.span
                  layoutId={`${id}-selection`}
                  className="absolute inset-0 rounded-2xl bg-[#007eff]"
                  transition={SELECTION_TRANSITION}
                  aria-hidden="true"
                />
              ) : null}

              {isSelected ? (
                <span className="absolute right-1.5 top-1.5 z-10 flex size-4.5 items-center justify-center rounded-full bg-white/20">
                  <Check className="size-3 text-white" aria-hidden="true" />
                </span>
              ) : null}

              <span className="relative z-10 flex flex-col items-center">
                <span className="flex items-center gap-2">
                  {option.swatchColor ? (
                    <span
                      className="size-5 rounded-full border"
                      style={{
                        backgroundColor: option.swatchColor,
                        borderColor: option.swatchBorder ?? "#2A2A2A",
                      }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{option.label}</span>
                </span>

                {option.description ? (
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] leading-tight",
                      isSelected ? "text-white/85" : "text-white/55"
                    )}
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ReprintSameModal({
  bookTitle,
  config,
  errorMessage,
  isError,
  isLoading,
  onOpenChange,
  onRetry,
  open,
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
  const [copiesInput, setCopiesInput] = useState("25");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingPaymentProvider, setPendingPaymentProvider] =
    useState<ReprintPaymentProvider | null>(null);
  const [selectedBookSize, setSelectedBookSize] = useState<ReprintBookSize>("A5");
  const [selectedPaperColor, setSelectedPaperColor] = useState<ReprintPaperColor>("white");
  const [selectedLamination, setSelectedLamination] = useState<ReprintLamination>("gloss");
  const {
    data: paymentGateways,
    isError: isPaymentGatewaysError,
    isLoading: isPaymentGatewaysLoading,
    refetch: refetchPaymentGateways,
  } = usePaymentGateways(open && config?.canReprintSame === true);

  const motionProps = getReprintSameModalMotionProps(prefersReducedMotion, isMobile);
  const minCopies = config?.minCopies ?? 25;

  useEffect(() => {
    if (!open || !config) {
      return;
    }

    setCopiesInput(String(minCopies));
    setPaymentError(null);
    setPendingPaymentProvider(null);
    setSelectedBookSize(config.defaultBookSize ?? config.allowedBookSizes[0] ?? "A5");
    setSelectedPaperColor(config.defaultPaperColor);
    setSelectedLamination(config.defaultLamination);
  }, [config, minCopies, open]);

  const bookSizeOptions = useMemo<GroupOption<ReprintBookSize>[]>(
    () => [
      { value: "A4", label: tCheckout("configuration_book_size_a4") },
      { value: "A5", label: tCheckout("configuration_book_size_a5") },
      { value: "A6", label: tCheckout("configuration_book_size_a6") },
    ],
    [tCheckout]
  );

  const paperColorOptions = useMemo<GroupOption<ReprintPaperColor>[]>(
    () => [
      {
        value: "white",
        label: tCheckout("configuration_paper_white"),
        swatchColor: "#ffffff",
        swatchBorder: "#2A2A2A",
      },
      {
        value: "cream",
        label: tCheckout("configuration_paper_cream"),
        swatchColor: "#f2ead7",
        swatchBorder: "#d9cdb6",
      },
    ],
    [tCheckout]
  );

  const laminationOptions = useMemo<GroupOption<ReprintLamination>[]>(
    () => [
      {
        value: "matt",
        label: tCheckout("configuration_lamination_matt"),
        description: tCheckout("configuration_lamination_matt_desc"),
      },
      {
        value: "gloss",
        label: tCheckout("configuration_lamination_gloss"),
        description: tCheckout("configuration_lamination_gloss_desc"),
      },
    ],
    [tCheckout]
  );

  const effectiveCopies = clampCopies(copiesInput, minCopies);
  const selectedCostPerPage =
    config?.costPerPageBySize[selectedBookSize] ?? config?.costPerPageBySize.A5 ?? 0;
  const totalPrice =
    typeof config?.pageCount === "number" && config.pageCount > 0
      ? effectiveCopies * config.pageCount * selectedCostPerPage
      : 0;
  const showUnavailableState = !isLoading && !isError && config !== null && !config.canReprintSame;
  const inlinePaymentGateways = useMemo<InlineReprintPaymentGateway[]>(() => {
    const enabledProviders = new Set(config?.enabledPaymentProviders ?? []);

    return (paymentGateways ?? []).filter(
      (gateway): gateway is InlineReprintPaymentGateway =>
        (gateway.provider === "PAYSTACK" || gateway.provider === "STRIPE") &&
        enabledProviders.has(gateway.provider)
    );
  }, [config?.enabledPaymentProviders, paymentGateways]);

  const handleCopiesChange = (value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setCopiesInput(value);
  };

  const handleCopiesBlur = () => {
    setCopiesInput(String(clampCopies(copiesInput, minCopies)));
  };

  const handleCopiesStep = (direction: "decrease" | "increase") => {
    const nextValue =
      direction === "decrease"
        ? Math.max(minCopies, effectiveCopies - 1)
        : Math.max(minCopies, effectiveCopies + 1);

    setCopiesInput(String(nextValue));
  };

  const handleRetry = () => {
    onRetry?.();
  };

  const handleStartPayment = async (provider: ReprintPaymentProvider) => {
    if (!config) {
      return;
    }

    if (isOffline) {
      setPaymentError(tCommon("offline_banner"));
      return;
    }

    setPaymentError(null);
    setPendingPaymentProvider(provider);

    try {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const response = await payReprint({
        sourceBookId: config.bookId,
        copies: effectiveCopies,
        bookSize: selectedBookSize,
        paperColor: selectedPaperColor,
        lamination: selectedLamination,
        provider,
        ...(callbackUrl ? { callbackUrl } : {}),
      });

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
      setPendingPaymentProvider(null);
    }
  };

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
                      : "max-h-[min(88dvh,920px)] max-w-[min(880px,calc(100%-2rem))] rounded-[34px]"
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(72% 58% at 16% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 76%)",
                    }}
                  />

                  <div className="relative z-10 flex h-full flex-col px-5 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                    <button
                      ref={closeButtonRef}
                      type="button"
                      onClick={() => onOpenChange(false)}
                      aria-label={tDashboard("reprint_same_close_aria")}
                      className="absolute right-4 top-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>

                    <header className="pr-14">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-[#007eff]">
                        {tDashboard("reprint_same")}
                      </p>
                      <DialogPrimitive.Title className="font-display mt-4 text-[2rem] leading-[1.04] font-semibold tracking-tight text-white sm:text-[2.45rem]">
                        {tDashboard("reprint_same_modal_title")}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#BDBDBD] sm:text-[0.95rem]">
                        {tDashboard("reprint_same_modal_description")}
                      </DialogPrimitive.Description>
                    </header>

                    <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto pr-0 md:pr-1">
                      {isLoading ? (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-[30px] border border-[#2A2A2A] bg-[#050505] px-6 py-10 text-center">
                          <LoaderCircle
                            className="size-8 animate-spin text-[#007eff]"
                            aria-hidden="true"
                          />
                          <p className="font-display mt-5 text-2xl font-semibold text-white">
                            {tDashboard("reprint_same_loading_title")}
                          </p>
                          <p className="font-sans mt-3 max-w-md text-sm leading-6 text-[#BDBDBD]">
                            {tDashboard("reprint_same_loading_description")}
                          </p>
                        </div>
                      ) : isError ? (
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
                        <div className="flex flex-1 flex-col justify-between gap-6 rounded-[30px] border border-[#2A2A2A] bg-[#050505] p-5 sm:p-6">
                          <div>
                            <p className="font-display text-2xl font-semibold text-white">
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
                        <div className="space-y-5 pb-4">
                          <div className="rounded-[30px] border border-[#2A2A2A] bg-[#050505] p-5">
                            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                              {tDashboard("reprint_same_source_book_label")}
                            </p>
                            <p className="font-display mt-3 text-2xl font-semibold tracking-tight text-white">
                              {bookTitle || tDashboard("book_progress_meta_value_unavailable")}
                            </p>
                            <p className="font-sans mt-2 text-sm text-[#BDBDBD]">
                              {config.pageCount !== null
                                ? tDashboard("reprint_same_page_count", {
                                    count: formatInteger(config.pageCount, locale),
                                  })
                                : tDashboard("reprint_same_page_count_unavailable")}
                            </p>
                          </div>

                          <div className="rounded-[30px] border border-[#2A2A2A] bg-[#050505] p-5">
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
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#071320] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                <Minus className="size-4" aria-hidden="true" />
                              </button>

                              <input
                                id="reprint-same-copies"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min={minCopies}
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
                                count: formatInteger(minCopies, locale),
                              })}
                            </p>
                          </div>

                          <motion.div layout transition={SELECTION_TRANSITION}>
                            <OptionGroup
                              id="reprint-book-size"
                              icon={BookOpen}
                              label={tCheckout("configuration_book_size")}
                              value={selectedBookSize}
                              onChange={setSelectedBookSize}
                              options={bookSizeOptions.filter((option) =>
                                config.allowedBookSizes.includes(option.value)
                              )}
                              columns={3}
                            />
                          </motion.div>

                          <motion.div layout transition={SELECTION_TRANSITION}>
                            <OptionGroup
                              id="reprint-paper-color"
                              icon={Sparkles}
                              label={tCheckout("configuration_paper_color")}
                              value={selectedPaperColor}
                              onChange={setSelectedPaperColor}
                              options={paperColorOptions.filter((option) =>
                                config.allowedPaperColors.includes(option.value)
                              )}
                            />
                          </motion.div>

                          <motion.div layout transition={SELECTION_TRANSITION}>
                            <OptionGroup
                              id="reprint-lamination"
                              icon={Layers}
                              label={tCheckout("configuration_lamination")}
                              value={selectedLamination}
                              onChange={setSelectedLamination}
                              options={laminationOptions.filter((option) =>
                                config.allowedLaminations.includes(option.value)
                              )}
                            />
                          </motion.div>
                        </div>
                      ) : null}
                    </div>

                    {!isLoading && !isError && config && config.canReprintSame ? (
                      <div className="mt-5 border-t border-[#2A2A2A] pt-5">
                        <div className="rounded-[30px] border border-[#2A2A2A] bg-[#050505] p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                                {tDashboard("reprint_same_live_price_label")}
                              </p>
                              <p
                                className="font-display mt-3 text-[2.4rem] leading-none font-semibold tracking-tight text-white sm:text-[3rem]"
                                aria-live="polite"
                              >
                                {formatCurrency(totalPrice, locale)}
                              </p>
                            </div>

                            <div className="rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2">
                              <p className="font-sans text-sm text-[#BDBDBD]">
                                {tDashboard("reprint_same_rate_per_page", {
                                  amount: formatCurrency(selectedCostPerPage, locale),
                                })}
                              </p>
                            </div>
                          </div>

                          <p className="font-sans mt-4 text-sm leading-6 text-[#BDBDBD]">
                            {config.pageCount !== null
                              ? tDashboard("reprint_same_live_formula", {
                                  copies: formatInteger(effectiveCopies, locale),
                                  pages: formatInteger(config.pageCount, locale),
                                  rate: formatCurrency(selectedCostPerPage, locale),
                                })
                              : tDashboard("reprint_same_page_count_unavailable")}
                          </p>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-white/55">
                              {tDashboard("reprint_same_providers_label")}
                            </span>
                            {config.enabledPaymentProviders.map((provider) => (
                              <span
                                key={provider}
                                className="rounded-full border border-[#2A2A2A] bg-[#000000] px-3 py-1 font-sans text-xs font-semibold tracking-[0.08em] text-white/80 uppercase"
                              >
                                {provider}
                              </span>
                            ))}
                          </div>

                          <p className="font-sans mt-4 text-sm leading-6 text-[#BDBDBD]">
                            {tDashboard("reprint_same_price_preview_note")}
                          </p>

                          <div className="mt-5 rounded-[24px] border border-[#2A2A2A] bg-[#000000] p-4">
                            <p className="font-sans text-sm font-semibold text-white">
                              {tDashboard("reprint_same_payment_title")}
                            </p>
                            <p className="font-sans mt-2 text-sm leading-6 text-[#BDBDBD]">
                              {tDashboard("reprint_same_payment_description")}
                            </p>
                            <p className="font-sans mt-2 text-sm leading-6 text-[#9fd0ff]">
                              {tDashboard("reprint_same_payment_authenticated_note")}
                            </p>

                            {isOffline ? (
                              <p
                                aria-live="polite"
                                aria-atomic="true"
                                className="font-sans mt-4 rounded-[20px] border border-[#2A2A2A] bg-[#050505] px-4 py-3 text-sm leading-6 text-[#d0d0d0]"
                              >
                                {tCommon("offline_banner")}
                              </p>
                            ) : null}

                            {isPaymentGatewaysLoading ? (
                              <div className="mt-4 flex items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#050505] px-4 py-3">
                                <LoaderCircle
                                  className="size-4 animate-spin text-[#007eff]"
                                  aria-hidden="true"
                                />
                                <span className="font-sans text-sm text-[#BDBDBD]">
                                  {tDashboard("reprint_same_payment_gateways_loading")}
                                </span>
                              </div>
                            ) : isPaymentGatewaysError ? (
                              <div className="mt-4 rounded-[20px] border border-[#2A2A2A] bg-[#050505] p-4">
                                <p className="font-sans text-sm leading-6 text-[#BDBDBD]">
                                  {tDashboard("reprint_same_payment_gateways_error")}
                                </p>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    void refetchPaymentGateways();
                                  }}
                                  className="font-sans mt-3 min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
                                >
                                  {tDashboard("reprint_same_payment_retry")}
                                </Button>
                              </div>
                            ) : inlinePaymentGateways.length > 0 ? (
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {inlinePaymentGateways.map((gateway) => {
                                  const isPending = pendingPaymentProvider === gateway.provider;

                                  return (
                                    <button
                                      key={gateway.id}
                                      type="button"
                                      onClick={() => {
                                        void handleStartPayment(gateway.provider);
                                      }}
                                      disabled={pendingPaymentProvider !== null || isOffline}
                                      className={cn(
                                        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-5 py-3 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                                        pendingPaymentProvider !== null || isOffline
                                          ? "cursor-not-allowed border-[#2A2A2A] bg-[#121212] text-white/45"
                                          : "border-[#007eff] bg-transparent text-[#007eff] hover:border-[#3398ff] hover:bg-[#071320] hover:text-[#3398ff]"
                                      )}
                                    >
                                      {isPending ? (
                                        <>
                                          <LoaderCircle
                                            className="mr-2 size-4 animate-spin"
                                            aria-hidden="true"
                                          />
                                          {tDashboard("reprint_same_payment_processing")}
                                        </>
                                      ) : (
                                        tDashboard("reprint_same_payment_button", {
                                          provider: gateway.name,
                                        })
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="font-sans mt-4 text-sm leading-6 text-[#BDBDBD]">
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
                        </div>
                      </div>
                    ) : null}
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
