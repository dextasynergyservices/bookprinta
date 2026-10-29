import {
  CHECKOUT_PRICING_SIGNATURE_KEY,
  CheckoutPricingService,
} from "../../src/payments/services/checkout-pricing.service.js";

/**
 * Sign fixture metadata exactly as `PaymentsService.initialize` would, so specs
 * that exercise fulfilment (emails, approvals) start from realistic, trusted
 * checkout metadata instead of the legacy unsigned shape.
 */
export function withSignedCheckoutPricing<T extends Record<string, unknown>>(metadata: T): T {
  const pricing = new CheckoutPricingService({} as never);
  const signature = pricing.sign(
    pricing.fromCheckoutFields({
      packageId: metadata.packageId as string | undefined,
      addons: metadata.addons as Array<{ id?: string; price?: number; wordCount?: number }>,
      couponCode: metadata.couponCode as string | undefined,
      discountAmount: metadata.discountAmount as number | undefined,
      totalPrice: metadata.totalPrice as number | undefined,
      dashboardUserId: metadata.dashboardUserId as string | undefined,
    })
  );
  return { ...metadata, [CHECKOUT_PRICING_SIGNATURE_KEY]: signature };
}
