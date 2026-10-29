/**
 * Remembers an online checkout that left for the payment provider.
 *
 * BookPrinta does not receive Paystack webhooks (the account is shared with
 * another product), so an order is created when the customer returns to the
 * confirmation page — or, failing that, by the reconciliation cron. If the
 * customer pays and closes the tab before the redirect, this record lets the
 * next visit finish the order immediately instead of waiting for the cron.
 *
 * Holds only the provider reference (no amounts, no personal data). Stored in
 * localStorage, so it is per-browser and best-effort by design.
 */

const STORAGE_KEY = "bp_pending_checkout";

/** Older than this, the cron has long since reconciled it — stop retrying. */
export const PENDING_CHECKOUT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingCheckout = {
  reference: string;
  provider: string;
  /** Locale-less path of the confirmation page for this checkout. */
  confirmPath: string;
  savedAt: number;
};

export function rememberPendingCheckout(entry: Omit<PendingCheckout, "savedAt">): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...entry, savedAt: Date.now() }));
  } catch {
    // Private mode / storage disabled — the cron still reconciles the payment.
  }
}

export function readPendingCheckout(now = Date.now()): PendingCheckout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>;
    if (
      typeof parsed.reference !== "string" ||
      typeof parsed.provider !== "string" ||
      typeof parsed.confirmPath !== "string" ||
      typeof parsed.savedAt !== "number" ||
      now - parsed.savedAt > PENDING_CHECKOUT_MAX_AGE_MS
    ) {
      clearPendingCheckout();
      return null;
    }
    return parsed as PendingCheckout;
  } catch {
    return null;
  }
}

export function clearPendingCheckout(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
