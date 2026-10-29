/**
 * Injection tokens for payment provider SDK instances.
 * Used by provider factories and injected via @Inject(TOKEN).
 * Follows the same pattern as CLOUDINARY token in cloudinary.constants.ts.
 */
export const PAYSTACK_CLIENT = "PAYSTACK_CLIENT";
export const STRIPE_CLIENT = "STRIPE_CLIENT";
export const PAYPAL_CLIENT = "PAYPAL_CLIENT";

/**
 * Product tag on every Paystack charge BookPrinta creates (`metadata.app`).
 *
 * BookPrinta shares one Paystack account with another product and does not own
 * its webhook URL, so fulfilment relies on the browser redirect plus the
 * reconciliation cron. The tag lets reconciliation recognise ALL of our charges —
 * including extra-page and reprint payments, whose metadata has no checkout
 * shape — and skip the other product's without guessing.
 */
export const PAYSTACK_PRODUCT_TAG_KEY = "app";
export const PAYSTACK_PRODUCT_TAG = "bookprinta";
