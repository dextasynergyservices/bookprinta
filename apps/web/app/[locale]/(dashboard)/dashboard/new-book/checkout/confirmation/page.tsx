"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { verifyPayment } from "@/hooks/usePayments";
import { Link } from "@/lib/i18n/navigation";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type OnlineProvider = "PAYSTACK" | "STRIPE" | "PAYPAL";

function normalizeProvider(provider: string | null | undefined): OnlineProvider | null {
  if (typeof provider !== "string") return null;
  const normalized = provider.trim().toUpperCase();
  if (normalized === "PAYSTACK") return "PAYSTACK";
  if (normalized === "STRIPE") return "STRIPE";
  if (normalized === "PAYPAL") return "PAYPAL";
  return null;
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

function ConfirmationContent() {
  const t = useTranslations("dashboard");
  const tCheckout = useTranslations("checkout");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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

  const isBankTransfer = !provider;

  const [status, setStatus] = useState<"verifying" | "verified" | "failed" | "bank_pending">(
    isBankTransfer ? "bank_pending" : "verifying"
  );

  useEffect(() => {
    if (!provider || !reference) return;

    let cancelled = false;

    async function verify() {
      try {
        const result = await verifyPayment(reference as string, provider);
        if (cancelled) return;

        if (result.verified) {
          setStatus("verified");
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["books"] });
        } else if (result.awaitingWebhook) {
          setStatus("verified");
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        } else {
          setStatus("failed");
        }
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [provider, queryClient, reference]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Loader2 className="size-10 animate-spin text-[#007eff]" aria-hidden="true" />
        <p className="font-sans text-base text-white/70">{tCheckout("payment_verify_loading")}</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-[#ff6b6b]/40 bg-[#ff6b6b]/12">
          <AlertTriangle className="size-8 text-[#ff6b6b]" aria-hidden="true" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">
          {t("new_book_confirm_failed_title")}
        </h2>
        <p className="max-w-md font-sans text-sm text-white/60">
          {t("new_book_confirm_failed_desc")}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110"
        >
          {t("new_book_confirm_back_dashboard")}
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="flex flex-col items-center gap-5 py-16 text-center"
    >
      {isBankTransfer ? (
        <div className="flex size-20 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12">
          <CreditCard className="size-8 text-[#007eff]" aria-hidden="true" />
        </div>
      ) : (
        <AnimatedCheckmark />
      )}

      <h2 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
        {isBankTransfer ? t("new_book_confirm_bank_title") : t("new_book_confirm_success_title")}
      </h2>

      <p className="max-w-lg font-sans text-sm leading-relaxed text-white/60">
        {isBankTransfer ? t("new_book_confirm_bank_desc") : t("new_book_confirm_success_desc")}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard/orders"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110"
        >
          {t("new_book_confirm_view_orders")}
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] px-6 font-sans text-sm font-medium text-white/80 transition-colors duration-150 hover:border-[#007eff] hover:text-white"
        >
          {t("new_book_confirm_back_dashboard")}
        </Link>
      </div>

      {isBankTransfer ? (
        <p className="mt-2 font-sans text-xs text-white/40">{t("new_book_confirm_bank_note")}</p>
      ) : null}
    </motion.div>
  );
}

export default function DashboardNewBookCheckoutConfirmationPage() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-[#007eff]" />
          </div>
        }
      >
        <ConfirmationContent />
      </Suspense>
    </div>
  );
}
