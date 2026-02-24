import { Logger } from "@nestjs/common";
import { PAYSTACK_CLIENT } from "../constants.js";

const logger = new Logger("PaystackProvider");

/**
 * Configuration object for the Paystack provider.
 * We use raw HTTP (axios) for Paystack — no SDK needed.
 * This factory reads env vars and returns the config or null.
 *
 * If PAYSTACK_SECRET_KEY is missing, the provider logs a warning
 * and returns null. The server still boots — payment endpoints that
 * require Paystack will throw ServiceUnavailableException at runtime.
 */
export interface PaystackConfig {
  secretKey: string;
  baseUrl: string;
  currency: string;
}

export const PaystackProvider = {
  provide: PAYSTACK_CLIENT,
  useFactory: (): PaystackConfig | null => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      logger.warn(
        "PAYSTACK_SECRET_KEY not set. Paystack payments will be unavailable until configured."
      );
      return null;
    }

    logger.log("Paystack configured successfully");
    return {
      secretKey,
      baseUrl: "https://api.paystack.co",
      currency: "NGN",
    };
  },
};
