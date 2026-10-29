"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { verifyPayment } from "@/hooks/usePayments";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { clearPendingCheckout, readPendingCheckout } from "@/lib/payments/pending-checkout";

/** Provider statuses that mean the customer never paid — stop retrying. */
const ABANDONED_STATUSES = new Set(["abandoned", "failed", "reversed", "cancelled", "expired"]);

/**
 * Finishes a checkout whose customer paid but never came back from the payment
 * page (see lib/payments/pending-checkout.ts). Runs once per page load, makes no
 * request unless a pending reference exists, and stays silent unless it actually
 * recovered a payment.
 */
export function PendingPaymentRecovery() {
  const t = useTranslations("checkout");
  const pathname = usePathname();
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    const pending = readPendingCheckout();
    if (!pending) return;

    // The confirmation page verifies and finalises on its own.
    if (pathname === pending.confirmPath) {
      clearPendingCheckout();
      return;
    }

    attempted.current = true;
    const { reference, provider, confirmPath } = pending;

    void verifyPayment(reference, provider)
      .then((result) => {
        if (result.verified) {
          clearPendingCheckout();
          toast.success(t("payment_recovery_title"), {
            description: t("payment_recovery_description"),
            duration: 15_000,
            action: {
              label: t("payment_recovery_action"),
              onClick: () =>
                router.push(
                  `${confirmPath}?provider=${encodeURIComponent(provider)}&reference=${encodeURIComponent(reference)}`
                ),
            },
          });
          return;
        }
        if (ABANDONED_STATUSES.has(String(result.status).toLowerCase())) {
          clearPendingCheckout();
        }
        // Still pending at the provider: keep it and try again next visit.
      })
      .catch(() => {
        // Network/API hiccup — keep the record; the cron is the backstop.
      });
  }, [pathname, router, t]);

  return null;
}
