"use client";

import { useEffect, useRef } from "react";
import { trackPaymentCompleted } from "@/lib/analytics/posthog-events";

export function PaymentCompletedTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackPaymentCompleted();
    }
  }, []);

  return null;
}
