import { Logger } from "@nestjs/common";
import { PAYPAL_CLIENT } from "../constants.js";

const logger = new Logger("PayPalProvider");

/**
 * Configuration object for the PayPal provider.
 * We use raw HTTP (axios) for PayPal — lighter than the full SDK.
 *
 * If PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing, the provider
 * logs a warning and returns null. The server still boots — payment
 * endpoints that require PayPal will throw ServiceUnavailableException.
 */
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  currency: string;
}

export const PayPalProvider = {
  provide: PAYPAL_CLIENT,
  useFactory: (): PayPalConfig | null => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.warn(
        "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set. " +
          "PayPal payments will be unavailable until configured."
      );
      return null;
    }

    logger.log("PayPal configured successfully");
    return {
      clientId,
      clientSecret,
      // Sandbox for test mode — switch to live.paypal.com for production
      baseUrl: "https://api-m.sandbox.paypal.com",
      currency: "NGN",
    };
  },
};
