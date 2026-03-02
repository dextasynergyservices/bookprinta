"use client";

import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@/lib/i18n/navigation";

type VerificationState = "loading" | "waiting" | "cancelled" | "error";
type OnlineProvider = "PAYSTACK" | "STRIPE" | "PAYPAL";

type VerifyResponse = {
  status: string;
  reference: string;
  amount: number | null;
  currency: string | null;
  verified: boolean;
  signupUrl?: string | null;
  awaitingWebhook?: boolean;
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

export function redirectToUrl(url: string) {
  if (process.env.NODE_ENV === "test") return;
  window.location.assign(url);
}

function PaymentReturnPageContent() {
  const t = useTranslations("checkout");
  const router = useRouter();
  const routeParams = useParams<{ provider?: string | string[] }>();
  const searchParams = useSearchParams();
  const routeProvider = useMemo(() => {
    const rawProvider = routeParams.provider;
    return Array.isArray(rawProvider) ? rawProvider[0] : rawProvider;
  }, [routeParams.provider]);
  const provider = useMemo(() => normalizeProvider(routeProvider), [routeProvider]);
  const verifyingText = t("payment_return_verifying");
  const providerErrorText = t("payment_return_error_provider");
  const cancelledSubtitleText = t("payment_return_cancelled_subtitle");
  const missingReferenceText = t("payment_return_error_reference");
  const waitingWebhookText = t("payment_return_waiting_webhook");
  const waitingPendingText = t("payment_return_waiting_pending");
  const waitingEmailText = t("payment_return_waiting_email");
  const contactText = t("payment_return_contact");

  const [state, setState] = useState<VerificationState>("loading");
  const [message, setMessage] = useState<string>(verifyingText);

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

  const isCancelled = searchParams.get("cancelled") === "true";

  useEffect(() => {
    if (!provider) {
      setState("error");
      setMessage(providerErrorText);
      return;
    }

    if (isCancelled) {
      setState("cancelled");
      setMessage(cancelledSubtitleText);
      return;
    }

    if (!reference) {
      setState("error");
      setMessage(missingReferenceText);
      return;
    }

    let cancelled = false;

    const runVerification = async () => {
      setState("loading");
      setMessage(verifyingText);

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
            redirectToUrl(data.signupUrl);
            return;
          }

          if (data.verified) {
            setState("waiting");
            setMessage(waitingWebhookText);
            await sleep(1800);
            continue;
          }

          setState("waiting");
          setMessage(waitingPendingText);
          await sleep(1800);
        } catch {
          await sleep(1500);
        }
      }

      if (!cancelled) {
        setState("waiting");
        setMessage(waitingEmailText);
      }
    };

    void runVerification();

    return () => {
      cancelled = true;
    };
  }, [
    cancelledSubtitleText,
    isCancelled,
    missingReferenceText,
    provider,
    providerErrorText,
    reference,
    verifyingText,
    waitingEmailText,
    waitingPendingText,
    waitingWebhookText,
  ]);

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2A2A2A] bg-[#090909] p-6 md:p-8">
        <div className="flex size-14 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12 text-[#9fd0ff]">
          {state === "cancelled" ? (
            <ShieldAlert className="size-7" aria-hidden="true" />
          ) : state === "error" ? (
            <ShieldAlert className="size-7" aria-hidden="true" />
          ) : state === "waiting" ? (
            <CheckCircle2 className="size-7" aria-hidden="true" />
          ) : (
            <Loader2 className="size-7 animate-spin" aria-hidden="true" />
          )}
        </div>

        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          {state === "cancelled"
            ? t("payment_return_cancelled_title")
            : state === "error"
              ? t("payment_return_error_title")
              : t("payment_return_title")}
        </h1>

        <output
          className="mt-3 block font-sans text-sm leading-relaxed text-white/70 md:text-base"
          aria-live="polite"
        >
          {message}
        </output>

        <div className="mt-7 flex flex-col gap-3 md:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("payment_return_retry")}
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("addons_back_to_pricing")}
          </button>
          <Link
            href="/contact"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {contactText}
          </Link>
        </div>
      </section>
    </main>
  );
}

function PaymentReturnFallback() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2A2A2A] bg-[#090909] p-6 md:p-8">
        <div className="flex size-14 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12 text-[#9fd0ff]">
          <Loader2 className="size-7 animate-spin" aria-hidden="true" />
        </div>
        <p className="mt-5 font-sans text-sm text-white/75">Loading...</p>
      </section>
    </main>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<PaymentReturnFallback />}>
      <PaymentReturnPageContent />
    </Suspense>
  );
}
