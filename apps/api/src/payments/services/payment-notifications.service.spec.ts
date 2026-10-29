/// <reference types="jest" />
import { PaymentsModule } from "../payments.module.js";
import { PaymentsService } from "../payments.service.js";
import { PaymentNotificationsService } from "./payment-notifications.service.js";

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

describe("PaymentNotificationsService wiring", () => {
  // PaymentsService takes it as an @Optional() dependency, so a missing module
  // registration would not fail: Nest would silently use a private instance.
  it("is registered in PaymentsModule and injected into PaymentsService", () => {
    const providers: unknown[] = Reflect.getMetadata("providers", PaymentsModule) ?? [];
    const paramTypes: unknown[] = Reflect.getMetadata("design:paramtypes", PaymentsService) ?? [];

    expect(providers).toContain(PaymentNotificationsService);
    expect(paramTypes).toContain(PaymentNotificationsService);
  });

  it("receives the Resend client PaymentsService is given", () => {
    const service = createPaymentsService();
    const resend = { emails: { send: jest.fn() } };

    (service as unknown as { resend: unknown }).resend = resend;

    const notifications = (service as unknown as { paymentNotifications: { resend: unknown } })
      .paymentNotifications;
    expect(notifications.resend).toBe(resend);
  });
});
