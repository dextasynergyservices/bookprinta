import posthog from "posthog-js";

function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.capture(event, properties);
  }
}

export function trackPackageSelected(packageSlug: string, categorySlug: string) {
  capture("package_selected", { package: packageSlug, category: categorySlug });
}

export function trackConfigurationCompleted(
  packageSlug: string,
  hasCover: boolean,
  hasFormatting: boolean
) {
  capture("configuration_completed", {
    package: packageSlug,
    has_cover: hasCover,
    has_formatting: hasFormatting,
  });
}

export function trackCheckoutStarted(packageSlug: string | null, total: number | null) {
  capture("checkout_started", { package: packageSlug, total });
}

export function trackPaymentCompleted(provider?: string, amount?: number, orderId?: string) {
  capture("payment_completed", { provider, amount, order_id: orderId });
}

export function trackQuoteSubmitted(bookSize: string, hasSpecialReqs: boolean) {
  capture("quote_submitted", { book_size: bookSize, has_special_reqs: hasSpecialReqs });
}

export function trackManuscriptUploaded(mimeType: string | null, wordCount: number) {
  capture("manuscript_uploaded", { mime_type: mimeType, word_count: wordCount });
}

export function trackBookApproved(bookId: string) {
  capture("book_approved", { book_id: bookId });
}
