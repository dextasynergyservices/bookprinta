import { Logger } from "@nestjs/common";
import Stripe from "stripe";
import { STRIPE_CLIENT } from "../constants.js";

const logger = new Logger("StripeProvider");

/**
 * Factory provider for the Stripe SDK instance.
 * Returns a configured Stripe client or null if keys are missing.
 *
 * If STRIPE_SECRET_KEY is missing, the provider logs a warning
 * and returns null. The server still boots — payment endpoints that
 * require Stripe will throw ServiceUnavailableException at runtime.
 */
export const StripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe | null => {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      logger.warn(
        "STRIPE_SECRET_KEY not set. Stripe payments will be unavailable until configured."
      );
      return null;
    }

    logger.log("Stripe configured successfully");
    return new Stripe(secretKey, {
      apiVersion: "2026-01-28.clover",
    });
  },
};
