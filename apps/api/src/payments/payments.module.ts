import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AdminPaymentsController } from "./admin-payments.controller.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { PayPalProvider } from "./providers/paypal.provider.js";
import { PaystackProvider } from "./providers/paystack.provider.js";
import { StripeProvider } from "./providers/stripe.provider.js";
import { PayPalService } from "./services/paypal.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { StripeService } from "./services/stripe.service.js";

/**
 * PaymentsModule — payment processing & webhook handling.
 *
 * Registers three payment provider factory providers (Paystack, Stripe, PayPal)
 * that gracefully return `null` when API keys are not configured.
 * The orchestrator service (PaymentsService) delegates to the appropriate
 * provider service based on the requested payment provider.
 *
 * Endpoints:
 *   GET  /payments/gateways
 *   POST /payments/initialize
 *   POST /payments/verify/:reference
 *   POST /payments/bank-transfer
 *   POST /payments/extra-pages       (authenticated)
 *   POST /payments/reprint           (authenticated)
 *   POST /payments/webhook/paystack  (Paystack signature verified)
 *   POST /payments/webhook/stripe    (Stripe signature verified)
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    // Provider factory instances (Paystack config | Stripe SDK | PayPal config)
    PaystackProvider,
    StripeProvider,
    PayPalProvider,

    // Provider-specific services
    PaystackService,
    StripeService,
    PayPalService,

    // Orchestrator
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
