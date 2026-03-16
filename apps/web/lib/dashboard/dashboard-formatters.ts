export function resolveDashboardLocaleTag(locale: string): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-NG";
}

export function toDashboardStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDashboardDate(
  value: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(resolveDashboardLocaleTag(locale), options).format(parsed);
}

export function formatDashboardInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(resolveDashboardLocaleTag(locale)).format(value);
}

export function formatDashboardCurrency(value: number, locale: string, currency = "NGN"): string {
  return new Intl.NumberFormat(resolveDashboardLocaleTag(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
