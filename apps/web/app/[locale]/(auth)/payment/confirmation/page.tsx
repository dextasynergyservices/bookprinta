"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Mail, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ResendSignupLinkForm } from "@/components/checkout/ResendSignupLinkForm";
import { Link, useRouter } from "@/lib/i18n/navigation";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type OnlineProvider = "PAYSTACK" | "STRIPE" | "PAYPAL";

type VerifySignupDelivery = {
  status: "DELIVERED" | "PARTIAL" | "FAILED";
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  attemptCount: number;
  lastAttemptAt?: string | null;
  retryEligible: boolean;
};

type VerifyResponse = {
  status: string;
  reference: string;
  amount: number | null;
  currency: string | null;
  verified: boolean;
  signupUrl?: string | null;
  awaitingWebhook?: boolean;
  email?: string | null;
  orderNumber?: string | null;
  packageName?: string | null;
  amountPaid?: string | null;
  addons?: string[];
  signupDelivery?: VerifySignupDelivery | null;
};

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function normalizeProvider(provider: string | null | undefined): OnlineProvider | null {
  if (typeof provider !== "string") return null;
  const normalized = provider.trim().toUpperCase();
  if (normalized === "PAYSTACK") return "PAYSTACK";
  if (normalized === "STRIPE") return "STRIPE";
  if (normalized === "PAYPAL") return "PAYPAL";
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBooleanFlag(value: string | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function appendPaymentReferenceParams(
  params: URLSearchParams,
  provider: OnlineProvider,
  reference: string
) {
  params.set("provider", provider);

  if (provider === "PAYSTACK") {
    params.set("reference", reference);
    return;
  }

  if (provider === "STRIPE") {
    params.set("session_id", reference);
    return;
  }

  params.set("token", reference);
}

function appendSignupDeliveryParams(
  params: URLSearchParams,
  signupDelivery: VerifySignupDelivery | null | undefined
) {
  if (!signupDelivery) return;

  params.set("signupDeliveryStatus", signupDelivery.status);
  params.set("signupDeliveryEmail", signupDelivery.emailDelivered ? "1" : "0");
  params.set("signupDeliveryWhatsApp", signupDelivery.whatsappDelivered ? "1" : "0");
  params.set("signupDeliveryAttempts", String(signupDelivery.attemptCount));
  if (signupDelivery.lastAttemptAt) {
    params.set("signupDeliveryLastAttemptAt", signupDelivery.lastAttemptAt);
  }
  params.set("signupDeliveryRetryEligible", signupDelivery.retryEligible ? "1" : "0");
}

function getSignupDeliveryFromSearchParams(
  searchParams: ReturnType<typeof useSearchParams>
): VerifySignupDelivery | null {
  const status = searchParams.get("signupDeliveryStatus");
  if (status !== "DELIVERED" && status !== "PARTIAL" && status !== "FAILED") {
    return null;
  }

  return {
    status,
    emailDelivered: parseBooleanFlag(searchParams.get("signupDeliveryEmail")) ?? false,
    whatsappDelivered: parseBooleanFlag(searchParams.get("signupDeliveryWhatsApp")) ?? false,
    attemptCount: Number(searchParams.get("signupDeliveryAttempts") ?? "0") || 0,
    lastAttemptAt: searchParams.get("signupDeliveryLastAttemptAt"),
    retryEligible: parseBooleanFlag(searchParams.get("signupDeliveryRetryEligible")) ?? false,
  };
}

function AnimatedCheckmark() {
  return (
    <motion.div
      className="flex size-20 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <motion.circle
          cx="20"
          cy="20"
          r="17"
          stroke="#007eff"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT }}
        />
        <motion.path
          d="M12 21l5.5 5.5L28 15"
          stroke="#9fd0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7, ease: EASE_OUT }}
        />
      </svg>
    </motion.div>
  );
}

function PaymentConfirmedContent() {
  const t = useTranslations("checkout");
  const router = useRouter();
  const searchParams = useSearchParams();

  const provider = useMemo(() => normalizeProvider(searchParams.get("provider")), [searchParams]);
  const reference = useMemo(() => {
    if (!provider) return null;
    if (provider === "PAYSTACK") {
      return searchParams.get("reference") || searchParams.get("trxref");
    }
    if (provider === "STRIPE") {
      return searchParams.get("session_id");
    }
    if (provider === "PAYPAL") {
      return searchParams.get("token");
    }
    return null;
  }, [provider, searchParams]);

  const email = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const orderRef = useMemo(() => searchParams.get("ref") ?? "", [searchParams]);
  const packageName = useMemo(() => searchParams.get("package") ?? "", [searchParams]);
  const amount = useMemo(() => searchParams.get("amount") ?? "", [searchParams]);
  const signupUrl = useMemo(() => searchParams.get("signupUrl") ?? "", [searchParams]);
  const signupDelivery = useMemo(
    () => getSignupDeliveryFromSearchParams(searchParams),
    [searchParams]
  );
  const addonsRaw = useMemo(() => searchParams.get("addons"), [searchParams]);
  const addons = useMemo(() => {
    if (!addonsRaw) return [] as string[];
    try {
      const parsed = JSON.parse(addonsRaw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [] as string[];
    }
  }, [addonsRaw]);

  const [verificationNotice, setVerificationNotice] = useState("");
  const [hasResentSignupLink, setHasResentSignupLink] = useState(false);

  useEffect(() => {
    if (!provider || !reference) return;
    if (signupUrl && signupDelivery) return;

    let cancelled = false;

    const runVerification = async () => {
      setVerificationNotice(t("payment_return_verifying"));

      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;

        try {
          const response = await fetch(
            `${getApiV1BaseUrl()}/payments/verify/${encodeURIComponent(reference)}?provider=${provider}`,
            { method: "POST" }
          );

          if (!response.ok) {
            await sleep(1500);
            continue;
          }

          const data = (await response.json()) as VerifyResponse;

          if (data.signupUrl) {
            const params = new URLSearchParams();
            appendPaymentReferenceParams(params, provider, reference);
            if (data.email) params.set("email", data.email);
            if (data.orderNumber) params.set("ref", data.orderNumber);
            if (data.packageName) params.set("package", data.packageName);
            if (data.amountPaid) params.set("amount", data.amountPaid);
            if (data.addons && data.addons.length > 0) {
              params.set("addons", JSON.stringify(data.addons));
            }
            params.set("signupUrl", data.signupUrl);
            appendSignupDeliveryParams(params, data.signupDelivery);
            router.replace(`/payment/confirmation?${params.toString()}`);
            return;
          }

          if (data.verified) {
            setVerificationNotice(t("payment_return_waiting_webhook"));
            await sleep(1800);
            continue;
          }

          setVerificationNotice(t("payment_return_waiting_pending"));
          await sleep(1800);
        } catch {
          await sleep(1500);
        }
      }

      if (!cancelled) {
        setVerificationNotice(t("payment_return_waiting_email"));
      }
    };

    void runVerification();

    return () => {
      cancelled = true;
    };
  }, [provider, reference, router, signupDelivery, signupUrl, t]);

  const hasOrderDetails = orderRef || packageName || amount || addons.length > 0;
  const isSignupDeliveryFailed = signupDelivery?.status === "FAILED";
  const isWhatsAppFallbackDelivery =
    signupDelivery?.status === "PARTIAL" &&
    signupDelivery.whatsappDelivered &&
    !signupDelivery.emailDelivered;

  const deliveryCardClass =
    isSignupDeliveryFailed || isWhatsAppFallbackDelivery
      ? "mt-6 rounded-2xl border border-[#f59e0b]/30 bg-[#f59e0b]/8 px-5 py-4"
      : "mt-6 rounded-2xl border border-[#007eff]/20 bg-[#007eff]/5 px-5 py-4";
  const deliveryTitleClass =
    isSignupDeliveryFailed || isWhatsAppFallbackDelivery
      ? "font-sans text-sm font-semibold text-[#fbbf24]"
      : "font-sans text-sm font-semibold text-[#007eff]";
  const deliveryTitle = isSignupDeliveryFailed
    ? t("payment_confirmed_delivery_failed_title")
    : isWhatsAppFallbackDelivery
      ? t("payment_confirmed_delivery_whatsapp_title")
      : t("payment_confirmed_check_email");
  const deliveryNote = isSignupDeliveryFailed
    ? signupDelivery && signupDelivery.attemptCount > 1
      ? t("payment_confirmed_delivery_failed_retry_note", {
          count: signupDelivery.attemptCount,
        })
      : t("payment_confirmed_delivery_failed_note")
    : isWhatsAppFallbackDelivery
      ? t("payment_confirmed_delivery_whatsapp_note")
      : t("payment_confirmed_check_email_note");

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2A2A2A] bg-[#090909] p-6 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          <AnimatedCheckmark />
        </motion.div>

        <motion.h1
          className="mt-6 font-display text-3xl font-bold tracking-tight text-white md:text-4xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE_OUT }}
        >
          {t("payment_confirmed_title")}
        </motion.h1>

        <motion.p
          className="mt-3 max-w-xl font-serif text-base leading-relaxed text-white/65"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT }}
        >
          {t("payment_confirmed_subtitle")}
        </motion.p>

        {verificationNotice && !signupUrl ? (
          <motion.p
            className="mt-3 max-w-xl font-sans text-sm leading-relaxed text-white/65"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45, ease: EASE_OUT }}
            aria-live="polite"
          >
            {verificationNotice}
          </motion.p>
        ) : null}

        {hasOrderDetails ? (
          <motion.div
            className="mt-6 rounded-2xl border border-[#2A2A2A] bg-black px-5 py-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: EASE_OUT }}
          >
            <dl className="space-y-2 font-sans text-sm">
              {orderRef ? (
                <div className="flex justify-between">
                  <dt className="text-white/50">{t("payment_confirmed_order_ref")}</dt>
                  <dd className="font-semibold text-white">{orderRef}</dd>
                </div>
              ) : null}
              {packageName ? (
                <div className="flex justify-between">
                  <dt className="text-white/50">{t("payment_confirmed_package")}</dt>
                  <dd className="font-semibold text-white">{packageName}</dd>
                </div>
              ) : null}
              {amount ? (
                <div className="flex justify-between">
                  <dt className="text-white/50">{t("payment_confirmed_amount")}</dt>
                  <dd className="font-semibold text-[#9fd0ff]">{amount}</dd>
                </div>
              ) : null}
              {addons.length > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-white/50">{t("payment_confirmed_addons")}</dt>
                  <dd className="text-right font-semibold text-white">{addons.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          </motion.div>
        ) : null}

        <motion.div
          className={deliveryCardClass}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.65, ease: EASE_OUT }}
        >
          <div className="flex items-start gap-3">
            {isSignupDeliveryFailed || isWhatsAppFallbackDelivery ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#fbbf24]" aria-hidden="true" />
            ) : (
              <Mail className="mt-0.5 size-5 shrink-0 text-[#007eff]" aria-hidden="true" />
            )}
            <div>
              <p className={deliveryTitleClass}>{deliveryTitle}</p>
              {email ? (
                <p className="mt-1 font-sans text-sm text-white/70">
                  {isSignupDeliveryFailed || isWhatsAppFallbackDelivery
                    ? t("payment_confirmed_attempted_email", { email })
                    : t("payment_confirmed_sent_to", { email })}
                </p>
              ) : null}
              <p className="mt-1 font-sans text-sm text-white/50">{deliveryNote}</p>
              {signupUrl && (isSignupDeliveryFailed || isWhatsAppFallbackDelivery) ? (
                <p className="mt-2 font-sans text-sm text-white/60">
                  {t("payment_confirmed_direct_signup_note")}
                </p>
              ) : null}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8, ease: EASE_OUT }}
        >
          <Suspense fallback={null}>
            <ResendSignupLinkForm onSuccess={() => setHasResentSignupLink(true)} />
          </Suspense>
        </motion.div>

        {signupUrl ? (
          <motion.div
            className="mt-7"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9, ease: EASE_OUT }}
          >
            <a
              href={signupUrl}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#007eff] px-6 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black md:w-auto"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {t("payment_confirmed_complete_signup")}
            </a>
          </motion.div>
        ) : null}

        {signupUrl && hasResentSignupLink ? (
          <motion.p
            className="mt-4 font-sans text-xs text-white/55"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            {t("payment_confirmation_resend_success")}
          </motion.p>
        ) : null}

        <motion.div
          className="mt-5 flex flex-col gap-3 md:flex-row"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0, ease: EASE_OUT }}
        >
          <Link
            href="/pricing"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("addons_back_to_pricing")}
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("payment_confirmation_home_cta")}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}

function PaymentConfirmedFallback() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2A2A2A] bg-[#090909] p-6 md:p-8">
        <div className="flex size-20 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12" />
        <p className="mt-5 font-sans text-sm text-white/75">Loading...</p>
      </section>
    </main>
  );
}

export default function PaymentConfirmedPage() {
  return (
    <Suspense fallback={<PaymentConfirmedFallback />}>
      <PaymentConfirmedContent />
    </Suspense>
  );
}
