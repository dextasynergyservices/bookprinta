/**
 * Injection tokens for payment provider SDK instances.
 * Used by provider factories and injected via @Inject(TOKEN).
 * Follows the same pattern as CLOUDINARY token in cloudinary.constants.ts.
 */
export const PAYSTACK_CLIENT = "PAYSTACK_CLIENT";
export const STRIPE_CLIENT = "STRIPE_CLIENT";
export const PAYPAL_CLIENT = "PAYPAL_CLIENT";
