const SUPPORTED_LOCALES = new Set(["en", "fr", "es"]);
const STATIC_MARKETING_PATHS = new Set([
  "/",
  "/about",
  "/pricing",
  "/faq",
  "/contact",
  "/showcase",
  "/resources",
]);

const API_PATH_PATTERN = /^\/api\/v\d+(?:\/|$)/i;
const PAYMENT_API_PATTERN = /^\/api\/v\d+\/(?:payments|pay)(?:\/|$)/i;
const ADMIN_PAYMENTS_API_PATTERN = /^\/api\/v\d+\/admin\/payments(?:\/|$)/i;
const AUTH_API_PATTERN = /^\/api\/v\d+\/auth(?:\/|$)/i;
const PREVIEW_API_PATTERN = /^\/api\/v\d+\/books\/[^/]+\/preview(?:\/|$)/i;
const DOWNLOAD_API_PATTERN = /\/download(?:\/|$)/i;
const UPLOAD_API_PATTERN = /\/(?:upload|upload-html|cover-upload)(?:\/|$)/i;
const WEBHOOK_API_PATTERN = /\/webhooks?(?:\/|$)/i;

export function normalizeAppPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0 && SUPPORTED_LOCALES.has(segments[0])) {
    segments.shift();
  }

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function isMarketingCachePath(pathname: string): boolean {
  const normalizedPath = normalizeAppPath(pathname);

  return STATIC_MARKETING_PATHS.has(normalizedPath) || normalizedPath.startsWith("/resources/");
}

export function isDashboardShellPath(pathname: string): boolean {
  const normalizedPath = normalizeAppPath(pathname);

  return normalizedPath === "/dashboard" || normalizedPath.startsWith("/dashboard/");
}

export function isPaymentDocumentPath(pathname: string): boolean {
  const normalizedPath = normalizeAppPath(pathname);

  return (
    normalizedPath === "/checkout" ||
    normalizedPath.startsWith("/checkout/") ||
    normalizedPath.startsWith("/pay/") ||
    normalizedPath.startsWith("/payment/")
  );
}

export function isApiPath(pathname: string): boolean {
  return API_PATH_PATTERN.test(pathname);
}

export function isPaymentApiPath(pathname: string): boolean {
  return PAYMENT_API_PATTERN.test(pathname) || ADMIN_PAYMENTS_API_PATTERN.test(pathname);
}

export function isAuthApiPath(pathname: string): boolean {
  return AUTH_API_PATTERN.test(pathname);
}

export function isPreviewApiPath(pathname: string): boolean {
  return PREVIEW_API_PATTERN.test(pathname);
}

export function isDownloadApiPath(pathname: string): boolean {
  return DOWNLOAD_API_PATTERN.test(pathname);
}

export function isUploadApiPath(pathname: string): boolean {
  return isApiPath(pathname) && UPLOAD_API_PATTERN.test(pathname);
}

export function isWebhookApiPath(pathname: string): boolean {
  return WEBHOOK_API_PATTERN.test(pathname);
}

export function isReadonlyApiPath(pathname: string): boolean {
  return (
    isApiPath(pathname) &&
    !isPaymentApiPath(pathname) &&
    !isAuthApiPath(pathname) &&
    !isPreviewApiPath(pathname) &&
    !isDownloadApiPath(pathname) &&
    !isUploadApiPath(pathname) &&
    !isWebhookApiPath(pathname)
  );
}
