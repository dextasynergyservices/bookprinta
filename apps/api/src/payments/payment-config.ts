/**
 * Environment-derived settings shared by payment services: the frontend base
 * URL used in links, and the sender/recipient addresses for payment emails.
 */

/** Dashboard home, appended to `/<locale>` in links. */
export const DEFAULT_DASHBOARD_PATH = "/dashboard";

export function resolveCustomerFacingFromEmail(): string {
  const configured =
    process.env.CONTACT_FROM_EMAIL ||
    process.env.DEFAULT_FROM_EMAIL ||
    process.env.ADMIN_FROM_EMAIL ||
    "BookPrinta <info@bookprinta.com>";

  const normalized = configured.trim();
  return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
}

export function resolveAdminNotificationsFromEmail(): string {
  const configured =
    process.env.ADMIN_FROM_EMAIL ||
    process.env.CONTACT_FROM_EMAIL ||
    process.env.DEFAULT_FROM_EMAIL ||
    "BookPrinta <info@bookprinta.com>";

  const normalized = configured.trim();
  return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
}

export function resolveAdminEmailRecipients(): string[] {
  const sources = [
    process.env.PAYMENT_ADMIN_EMAILS,
    process.env.ADMIN_NOTIFICATION_EMAIL,
    process.env.CONTACT_ADMIN_EMAIL,
    process.env.ADMIN_FROM_EMAIL,
    process.env.CONTACT_FROM_EMAIL,
  ];

  const recipients = sources
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .flatMap((value) => value.split(","))
    .map((value) => extractEmailAddress(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const unique = Array.from(new Set(recipients));
  return unique.length > 0 ? unique : ["info@bookprinta.com"];
}

export function extractEmailAddress(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const bracketMatch = normalized.match(/<([^>]+)>/);
  const candidate = bracketMatch?.[1]?.trim() || normalized;
  if (!candidate.includes("@")) return null;
  return candidate;
}

export function resolveFrontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL?.trim();
  if (!raw) {
    throw new Error("FRONTEND_URL environment variable is required for payment redirect links");
  }
  return raw.replace(/\/+$/, "");
}
