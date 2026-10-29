/// <reference types="jest" />
import { PaymentsModule } from "./payments.module.js";
import { PaymentsService } from "./payments.service.js";
import { BankTransferService } from "./services/bank-transfer.service.js";
import { CheckoutFulfillmentService } from "./services/checkout-fulfillment.service.js";
import { CheckoutIdentityService } from "./services/checkout-identity.service.js";
import { CheckoutMetadataPricingService } from "./services/checkout-metadata-pricing.service.js";
import { CheckoutPricingService } from "./services/checkout-pricing.service.js";
import { CustomQuoteFulfillmentService } from "./services/custom-quote-fulfillment.service.js";
import { PaymentNotificationsService } from "./services/payment-notifications.service.js";
import { PaymentReconciliationService } from "./services/payment-reconciliation.service.js";
import { SignupLinkDeliveryService } from "./services/signup-link-delivery.service.js";

/** Collaborators extracted from PaymentsService (see the payments.service.ts split). */
const COLLABORATORS = [
  PaymentNotificationsService,
  SignupLinkDeliveryService,
  PaymentReconciliationService,
  CheckoutPricingService,
  CheckoutMetadataPricingService,
  CheckoutIdentityService,
  CustomQuoteFulfillmentService,
  CheckoutFulfillmentService,
  BankTransferService,
];

function createPaymentsService(): PaymentsService {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  return new PaymentsService(
    {} as never,
    { isAvailable: false } as never,
    { isAvailable: false } as never,
    { isAvailable: false } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    null,
    null
  );
}

describe("PaymentsModule wiring", () => {
  // PaymentsService takes each collaborator as an @Optional() dependency so that
  // specs can build it positionally. A missing module registration would
  // therefore not fail: Nest would silently use a private instance instead.
  it.each(
    COLLABORATORS.map((type) => [type.name, type])
  )("registers %s and injects it into PaymentsService", (_name, type) => {
    const providers: unknown[] = Reflect.getMetadata("providers", PaymentsModule) ?? [];
    const paramTypes: unknown[] = Reflect.getMetadata("design:paramtypes", PaymentsService) ?? [];

    expect(providers).toContain(type);
    expect(paramTypes).toContain(type);
  });

  it("forwards the Resend client PaymentsService is given to PaymentNotificationsService", () => {
    const service = createPaymentsService();
    const resend = { emails: { send: jest.fn() } };

    (service as unknown as { resend: unknown }).resend = resend;

    const notifications = (service as unknown as { paymentNotifications: { resend: unknown } })
      .paymentNotifications;
    expect(notifications.resend).toBe(resend);
  });
});
