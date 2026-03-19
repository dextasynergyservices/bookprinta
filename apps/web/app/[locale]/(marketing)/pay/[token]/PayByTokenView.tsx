"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { submitBankTransfer, usePaymentGateways } from "@/hooks/usePayments";
import {
  payQuoteByToken,
  resolveQuotePaymentToken,
  verifyQuotePaymentReference,
} from "@/lib/api/quote-payment";
import { Link } from "@/lib/i18n/navigation";

type Provider = "PAYSTACK" | "STRIPE" | "BANK_TRANSFER";
type OnlineProvider = "PAYSTACK" | "STRIPE" | "PAYPAL";
type BankAccount = {
  accountName: string;
  accountNumber: string;
  bank: string;
};

const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
const RECEIPT_ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const PAY_CLICK_DEBOUNCE_MS = 900;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeProvider(provider: string | null | undefined): OnlineProvider | null {
  if (typeof provider !== "string") return null;
  const normalized = provider.trim().toUpperCase();
  if (normalized === "PAYSTACK") return "PAYSTACK";
  if (normalized === "STRIPE") return "STRIPE";
  if (normalized === "PAYPAL") return "PAYPAL";
  return null;
}

export function PayByTokenView({ token }: { token: string }) {
  const t = useTranslations("quote_pay");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;
  const searchParams = useSearchParams();
  const { data: gateways } = usePaymentGateways(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState<Provider | null>(null);
  const [isVerifyingCallback, setIsVerifyingCallback] = useState(false);
  const [showBankTransferForm, setShowBankTransferForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isRedirectingToProvider, setIsRedirectingToProvider] = useState(false);
  const [bankFullName, setBankFullName] = useState("");
  const [bankEmail, setBankEmail] = useState("");
  const [bankPhone, setBankPhone] = useState("");
  const [bankReceiptFile, setBankReceiptFile] = useState<File | null>(null);
  const [bankReceiptError, setBankReceiptError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Awaited<
    ReturnType<typeof resolveQuotePaymentToken>
  > | null>(null);
  const lastPayClickAtRef = useRef<number>(0);

  const bankGateway = useMemo(
    () => (gateways ?? []).find((gateway) => gateway.provider === "BANK_TRANSFER") ?? null,
    [gateways]
  );
  const enabledProviders = useMemo(
    () => new Set((gateways ?? []).filter((gateway) => gateway.isEnabled).map((g) => g.provider)),
    [gateways]
  );
  const canPayWithPaystack = enabledProviders.has("PAYSTACK");
  const canPayWithStripe = enabledProviders.has("STRIPE");
  const canPayWithBankTransfer = enabledProviders.has("BANK_TRANSFER");
  const bankAccounts = useMemo(
    () => parseBankAccounts(bankGateway?.bankDetails ?? null),
    [bankGateway?.bankDetails]
  );

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const payload = await resolveQuotePaymentToken(token, controller.signal);
        if (isMounted) {
          setResolved(payload);
        }
      } catch {
        if (isMounted) {
          setErrorMessage(t("resolve_error"));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [t, token]);

  useEffect(() => {
    const provider = normalizeProvider(searchParams.get("provider"));
    const reference =
      provider === "STRIPE"
        ? searchParams.get("session_id") || searchParams.get("reference")
        : searchParams.get("reference") ||
          searchParams.get("trxref") ||
          searchParams.get("session_id");
    const awaitingApproval = searchParams.get("status") === "awaiting-approval";
    const isCancelled = searchParams.get("cancelled") === "true";

    if (isCancelled) {
      setErrorMessage(t("cancelled_error"));
      return;
    }

    if (awaitingApproval) {
      setVerificationNotice(t("awaiting_approval"));
    }

    if (!reference) {
      return;
    }

    let cancelled = false;

    const verify = async () => {
      setIsVerifyingCallback(true);
      setVerificationNotice(t("verifying_payment"));

      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;

        try {
          const result = await verifyQuotePaymentReference(reference, provider);

          if (result.signupUrl) {
            window.location.assign(result.signupUrl);
            return;
          }

          if (result.verified || result.awaitingWebhook) {
            setVerificationNotice(t("awaiting_webhook"));
            await sleep(1800);
            continue;
          }

          setVerificationNotice(t("awaiting_confirmation"));
          await sleep(1800);
        } catch {
          await sleep(1500);
        }
      }

      if (!cancelled) {
        setVerificationNotice(t("awaiting_email"));
      }
    };

    void verify().finally(() => {
      if (!cancelled) {
        setIsVerifyingCallback(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams, t]);

  useEffect(() => {
    if (!resolved?.quote) return;
    setBankFullName((current) => current || resolved.quote?.fullName || "");
    setBankEmail((current) => current || resolved.quote?.email || "");
  }, [resolved?.quote]);

  const isValid = resolved?.tokenStatus === "VALID" && Boolean(resolved.quote);
  const title = useMemo(() => {
    if (isLoading) return t("loading_title");
    if (errorMessage) return t("error_title");

    switch (resolved?.tokenStatus) {
      case "VALID":
        return t("valid_title");
      case "PAID":
        return t("paid_title");
      case "EXPIRED":
        return t("expired_title");
      case "REVOKED":
        return t("revoked_title");
      default:
        return t("invalid_title");
    }
  }, [errorMessage, isLoading, resolved?.tokenStatus, t]);

  const subtitle =
    errorMessage ||
    resolved?.message ||
    (resolved?.tokenStatus === "VALID" ? t("valid_subtitle") : t("invalid_subtitle"));

  const isBankFormComplete =
    bankFullName.trim().length >= 2 &&
    isValidEmail(bankEmail.trim()) &&
    bankPhone.trim().length >= 7 &&
    bankReceiptFile !== null;

  const handlePay = async (provider: Provider) => {
    if (isOffline) {
      setErrorMessage(tCommon("offline_banner"));
      return;
    }

    const now = Date.now();
    if (now - lastPayClickAtRef.current < PAY_CLICK_DEBOUNCE_MS) return;
    lastPayClickAtRef.current = now;

    if (!enabledProviders.has(provider)) {
      setErrorMessage(t("pay_error"));
      return;
    }

    if (provider === "BANK_TRANSFER") {
      setShowBankTransferForm(true);
      setErrorMessage(null);
      return;
    }

    setIsPaying(provider);
    setErrorMessage(null);

    try {
      const response = await payQuoteByToken(token, { provider });
      setIsRedirectingToProvider(true);
      window.location.assign(response.redirectTo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("pay_error"));
      setIsPaying(null);
      setIsRedirectingToProvider(false);
    }
  };

  const handleReceiptFileChange = (file: File | null) => {
    setBankReceiptError(null);
    setBankReceiptFile(null);

    if (!file) return;
    if (isOffline) {
      setBankReceiptError(tCommon("offline_banner"));
      return;
    }

    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setBankReceiptError(t("bank_receipt_too_large"));
      return;
    }

    if (!RECEIPT_ALLOWED_TYPES.has(file.type)) {
      setBankReceiptError(t("bank_receipt_invalid_type"));
      return;
    }

    setBankReceiptFile(file);
  };

  const handleBankTransferSubmit = async () => {
    if (isOffline) {
      setErrorMessage(tCommon("offline_banner"));
      return;
    }

    const now = Date.now();
    if (now - lastPayClickAtRef.current < PAY_CLICK_DEBOUNCE_MS) return;
    lastPayClickAtRef.current = now;

    if (!resolved?.quote || !bankReceiptFile || !isBankFormComplete) {
      setErrorMessage(t("bank_form_incomplete"));
      return;
    }

    setErrorMessage(null);
    setIsPaying("BANK_TRANSFER");

    try {
      await submitBankTransfer({
        payerName: bankFullName.trim(),
        payerEmail: bankEmail.trim().toLowerCase(),
        payerPhone: bankPhone.trim(),
        amount: resolved.quote.finalPrice,
        currency: "NGN",
        receiptFile: bankReceiptFile,
        metadata: {
          paymentFlow: "CUSTOM_QUOTE",
          customQuoteId: resolved.quote.id,
          quoteTitle: resolved.quote.workingTitle,
          quoteQuantity: resolved.quote.quantity,
          quotePrintSize: resolved.quote.bookPrintSize,
          quoteFinalPrice: resolved.quote.finalPrice,
          packageName: "Custom Quote",
          locale,
          fullName: bankFullName.trim(),
          phone: bankPhone.trim(),
          email: bankEmail.trim().toLowerCase(),
          payerEmail: bankEmail.trim().toLowerCase(),
        },
      });

      setVerificationNotice(t("awaiting_approval"));
      setShowBankTransferForm(false);
      setBankReceiptFile(null);
      setBankReceiptError(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("pay_error"));
    } finally {
      setIsPaying(null);
    }
  };

  return (
    <section
      className="relative min-h-[70vh] overflow-hidden bg-[radial-gradient(circle_at_20%_10%,#2f3c56_0%,#1f2a3d_45%,#171f2f_100%)] px-4 py-20 md:px-8"
      style={
        {
          "--primary": "#1f2a3d",
          "--primary-foreground": "#f8fafc",
        } as React.CSSProperties
      }
    >
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-black/10 bg-white/90 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/55">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-black/70 md:text-base">{subtitle}</p>

        {isLoading ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-black/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("loading_body")}</span>
          </div>
        ) : null}

        {!isLoading && resolved?.quote ? (
          <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/60">
              {t("quote_summary")}
            </h2>
            <dl className="mt-4 space-y-3 text-sm text-black/80">
              <div className="flex items-center justify-between gap-4">
                <dt>{t("title_label")}</dt>
                <dd className="font-medium text-black">{resolved.quote.workingTitle}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>{t("author_label")}</dt>
                <dd className="font-medium text-black">{resolved.quote.fullName}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>{t("size_label")}</dt>
                <dd className="font-medium text-black">{resolved.quote.bookPrintSize}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>{t("quantity_label")}</dt>
                <dd className="font-medium text-black">{resolved.quote.quantity}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-3">
                <dt className="font-semibold text-black">{t("amount_label")}</dt>
                <dd className="text-lg font-semibold text-black">
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: "NGN",
                    maximumFractionDigits: 0,
                  }).format(resolved.quote.finalPrice)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {isValid ? (
          <div className="mt-8 space-y-3">
            {isOffline ? (
              <p
                aria-live="polite"
                aria-atomic="true"
                className="rounded-2xl border border-black/10 bg-[#eef4fb] px-4 py-3 text-sm text-[#1f2a3d]"
              >
                {tCommon("offline_banner")}
              </p>
            ) : null}
            {canPayWithPaystack ? (
              <button
                type="button"
                onClick={() => void handlePay("PAYSTACK")}
                disabled={
                  Boolean(isPaying) || isVerifyingCallback || isRedirectingToProvider || isOffline
                }
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPaying === "PAYSTACK"
                  ? isRedirectingToProvider
                    ? t("redirecting_to_provider")
                    : t("processing")
                  : t("paystack")}
              </button>
            ) : null}
            {canPayWithStripe ? (
              <button
                type="button"
                onClick={() => void handlePay("STRIPE")}
                disabled={
                  Boolean(isPaying) || isVerifyingCallback || isRedirectingToProvider || isOffline
                }
                className="w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPaying === "STRIPE"
                  ? isRedirectingToProvider
                    ? t("redirecting_to_provider")
                    : t("processing")
                  : t("stripe")}
              </button>
            ) : null}
            {canPayWithBankTransfer ? (
              <button
                type="button"
                onClick={() => void handlePay("BANK_TRANSFER")}
                disabled={
                  Boolean(isPaying) || isVerifyingCallback || isRedirectingToProvider || isOffline
                }
                className="w-full rounded-xl border border-black/20 bg-[#f7f1e6] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#f3e7d2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPaying === "BANK_TRANSFER" ? t("processing") : t("bank_transfer")}
              </button>
            ) : null}

            {showBankTransferForm ? (
              <div className="rounded-2xl border border-black/10 bg-[#f9f6ee] p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/60">
                  {t("bank_title")}
                </h3>
                <p className="mt-2 text-sm text-black/70">{t("bank_subtitle")}</p>

                {bankGateway?.instructions ? (
                  <p className="mt-3 text-sm text-black/70">{bankGateway.instructions}</p>
                ) : null}

                {bankAccounts.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {bankAccounts.map((account) => (
                      <div
                        key={`${account.bank}-${account.accountNumber}`}
                        className="rounded-xl border border-black/10 bg-white p-3 text-sm"
                      >
                        <p className="text-black/60">{t("bank_name_label")}</p>
                        <p className="font-semibold text-black">{account.bank}</p>
                        <p className="mt-2 text-black/60">{t("bank_account_name")}</p>
                        <p className="font-semibold text-black">{account.accountName}</p>
                        <p className="mt-2 text-black/60">{t("bank_account_number")}</p>
                        <p className="font-semibold text-black">{account.accountNumber}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-black/70">{t("bank_no_accounts")}</p>
                )}

                <div className="mt-4 space-y-3">
                  <label className="block text-sm text-black/70" htmlFor="quote-bank-full-name">
                    {t("bank_form_full_name")}
                  </label>
                  <input
                    id="quote-bank-full-name"
                    type="text"
                    value={bankFullName}
                    onChange={(event) => setBankFullName(event.currentTarget.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black"
                  />

                  <label className="block text-sm text-black/70" htmlFor="quote-bank-email">
                    {t("bank_form_email")}
                  </label>
                  <input
                    id="quote-bank-email"
                    type="email"
                    value={bankEmail}
                    onChange={(event) => setBankEmail(event.currentTarget.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black"
                  />

                  <label className="block text-sm text-black/70" htmlFor="quote-bank-phone">
                    {t("bank_form_phone")}
                  </label>
                  <input
                    id="quote-bank-phone"
                    type="tel"
                    value={bankPhone}
                    onChange={(event) => setBankPhone(event.currentTarget.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black"
                  />

                  <label className="block text-sm text-black/70" htmlFor="quote-bank-receipt">
                    {t("bank_form_receipt")}
                  </label>
                  <input
                    id="quote-bank-receipt"
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    disabled={isOffline}
                    onChange={(event) =>
                      handleReceiptFileChange(event.currentTarget.files?.[0] ?? null)
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <p className="text-xs text-black/55">{t("bank_receipt_help")}</p>
                  {bankReceiptFile ? (
                    <p className="text-xs font-medium text-[#0b4f84]">
                      {t("bank_receipt_selected", { fileName: bankReceiptFile.name })}
                    </p>
                  ) : null}
                  {bankReceiptError ? (
                    <p className="text-xs font-medium text-red-600">{bankReceiptError}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleBankTransferSubmit()}
                    disabled={
                      !isBankFormComplete ||
                      isPaying === "BANK_TRANSFER" ||
                      isVerifyingCallback ||
                      isRedirectingToProvider ||
                      isOffline
                    }
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPaying === "BANK_TRANSFER" ? t("processing") : t("submit_bank_transfer")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {verificationNotice && !errorMessage ? (
          <p className="mt-5 text-sm font-medium text-[#0b4f84]">{verificationNotice}</p>
        ) : null}

        {errorMessage ? (
          <p className="mt-5 text-sm font-medium text-red-600">{errorMessage}</p>
        ) : null}

        {!isValid ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/contact"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {t("contact_support")}
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-black/20 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-black/[0.03]"
            >
              {t("go_pricing")}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
