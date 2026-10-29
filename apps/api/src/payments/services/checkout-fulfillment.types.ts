/**
 * Shared by checkout fulfilment (CheckoutFulfillmentService) and custom-quote
 * fulfilment (CustomQuoteFulfillmentService). Kept here so neither imports
 * the other for them.
 */
import type { Locale } from "@bookprinta/emails";

export const MAX_SIGNUP_TOKEN_HOURS = 24;

export type CheckoutFinalizationInfo = {
  userId: string;
  orderId: string;
  email: string;
  name: string;
  locale: Locale;
  signupToken: string | null;
  phone: string | null;
  whatsAppNotificationsEnabled: boolean;
  orderNumber: string;
  packageName: string;
  amountPaid: string;
  addons: string[];
};
