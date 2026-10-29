/**
 * Extra-page pricing for the billing gate (CLAUDE.md §7.2).
 *
 * The per-page price used to be a hard-coded ₦10 in four files. It is now the
 * admin-editable SystemSetting `extra_page_price` (Admin → System settings →
 * pricing), with ₦10 as the fallback when the row is absent or invalid.
 *
 * Price changes must never strand a customer who has already paid, so the gate
 * is satisfied by PAGES paid for (recorded on each EXTRA_PAGES payment as
 * `metadata.extraPages`), not by naira. A customer who paid for 40 pages at ₦10
 * is not blocked because an admin later raised the price to ₦15. Naira coverage
 * at the current price is still accepted, for payments made before
 * `extraPages` was recorded.
 */

export const EXTRA_PAGE_PRICE_SETTING_KEY = "extra_page_price";
export const DEFAULT_EXTRA_PAGE_PRICE_NGN = 10;

/** Short enough that an admin change applies within a minute on any instance. */
const CACHE_TTL_MS = 60_000;

type SettingsReader = {
  systemSetting: {
    findUnique(args: {
      where: { key: string };
      select: { value: true };
    }): Promise<{ value: string } | null>;
  };
};

let cached: { value: number; expiresAt: number } | null = null;

export function parseExtraPagePrice(raw: unknown): number | null {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(2));
}

/** Current per-page price in NGN. Falls back to the default on any failure. */
export async function resolveExtraPagePriceNgn(prisma: SettingsReader): Promise<number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  let value = DEFAULT_EXTRA_PAGE_PRICE_NGN;
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: EXTRA_PAGE_PRICE_SETTING_KEY },
      select: { value: true },
    });
    value = parseExtraPagePrice(row?.value) ?? DEFAULT_EXTRA_PAGE_PRICE_NGN;
  } catch {
    // A settings read must not take the billing gate down; use the default.
  }

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Call after an admin updates the setting so this instance applies it at once. */
export function invalidateExtraPagePriceCache(): void {
  cached = null;
}

export type ExtraPagePaymentRow = {
  amount: unknown;
  metadata?: unknown;
};

export function summarizeExtraPagePayments(payments: ExtraPagePaymentRow[]): {
  paidAmount: number;
  paidPages: number;
} {
  let paidAmount = 0;
  let paidPages = 0;
  for (const payment of payments) {
    const amount = toNumber(payment.amount);
    if (Number.isFinite(amount)) paidAmount += amount;

    const metadata =
      payment.metadata && typeof payment.metadata === "object"
        ? (payment.metadata as Record<string, unknown>)
        : null;
    const pages = Number(metadata?.extraPages ?? 0);
    if (Number.isInteger(pages) && pages > 0) paidPages += pages;
  }
  return { paidAmount: Number(paidAmount.toFixed(2)), paidPages };
}

/** True when the overage is covered by pages paid for, or by naira at today's price. */
export function isExtraPagesGateSatisfied(params: {
  overagePages: number;
  pricePerPage: number;
  paidAmount: number;
  paidPages: number;
}): boolean {
  if (params.overagePages <= 0) return true;
  if (params.paidPages >= params.overagePages) return true;
  return params.paidAmount + 0.005 >= params.overagePages * params.pricePerPage;
}

/** Handles numbers, numeric strings and Prisma Decimals. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value) {
    const fn = (value as { toNumber?: unknown }).toNumber;
    if (typeof fn === "function") return Number(fn.call(value));
  }
  return Number(value ?? 0);
}
