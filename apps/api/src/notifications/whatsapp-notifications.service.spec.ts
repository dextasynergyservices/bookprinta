/// <reference types="jest" />
import { WhatsappNotificationsService } from "./whatsapp-notifications.service.js";

describe("WhatsappNotificationsService", () => {
  it("skips user-facing delivery when WhatsApp notifications are disabled", async () => {
    const whatsappService = {
      sendText: jest.fn(),
      sendTemplate: jest.fn(),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    const result = await service.sendPaymentConfirmation({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
        whatsAppNotificationsEnabled: false,
      },
      orderNumber: "BP-2026-0001",
      amountLabel: "NGN 125,000",
      packageName: "Legacy",
    });

    expect(result).toEqual({
      attempted: false,
      delivered: false,
      failureReason: "User WhatsApp notifications disabled",
      normalizedTo: null,
      providerMessageId: null,
    });
    expect(whatsappService.sendText).not.toHaveBeenCalled();
    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });

  it("sends a localized book-status template in French", async () => {
    const whatsappService = {
      sendTemplate: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "msg-1",
      }),
      sendText: jest.fn(),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    await service.sendBookStatusUpdate({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "fr",
      },
      bookTitle: "The Lagos Chronicle",
      newStatus: "PRINTING",
      dashboardUrl: "https://bookprinta.com/fr/dashboard/books",
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+2348012345678",
        kind: "book status update",
        templateName: "book_status_update",
        language: "fr",
        bodyPlaceholders: ["Ada", "The Lagos Chronicle", "Impression"],
      })
    );
  });

  it("builds a shipping message with tracking details", async () => {
    const whatsappService = {
      sendText: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "msg-2",
      }),
      sendTemplate: jest.fn(),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    await service.sendShippingNotification({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
      },
      bookTitle: "The Lagos Chronicle",
      orderNumber: "BP-2026-0001",
      trackingNumber: "DHL-TRACK-001",
      shippingProvider: "DHL",
      trackingUrl: "https://bookprinta.com/en/dashboard/orders/order_1",
    });

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "shipping notification",
        text: expect.stringContaining("Tracking number: DHL-TRACK-001"),
      })
    );
    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });

  it("sends the bank transfer verification template with package and add-on placeholders", async () => {
    const whatsappService = {
      sendTemplate: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "msg-3",
      }),
      sendText: jest.fn(),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    await service.sendBankTransferVerification({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
      },
      orderNumber: "BP-2026-0001",
      amountLabel: "NGN 150,000",
      expectedWaitTime: "Less than 30 minutes",
      packageName: "Glow Up",
      addons: ["ISBN Registration", "Express Cover Design"],
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "bank transfer verification",
        templateName: "bank_transfer_user",
        language: "en",
        bodyPlaceholders: [
          "Ada",
          "Glow Up",
          "BP-2026-0001",
          "NGN 150,000",
          "ISBN Registration, Express Cover Design",
        ],
      })
    );
  });

  it("bypasses the WhatsApp preference for critical bank transfer receipt notifications", async () => {
    const whatsappService = {
      sendTemplate: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "msg-critical-1",
      }),
      sendText: jest.fn(),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    const result = await service.sendBankTransferVerification({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
        whatsAppNotificationsEnabled: false,
      },
      orderNumber: "BP-2026-0001",
      amountLabel: "NGN 150,000",
      expectedWaitTime: "Less than 30 minutes",
      packageName: "Glow Up",
      addons: ["ISBN Registration"],
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        delivered: true,
        failureReason: null,
      })
    );
  });

  it("falls back to text when a book-status template send fails", async () => {
    const whatsappService = {
      sendTemplate: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: false,
        failureReason: "400: template not found",
        normalizedTo: "+2348012345678",
        providerMessageId: null,
      }),
      sendText: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "msg-fallback-1",
      }),
    };
    const service = new WhatsappNotificationsService(whatsappService as never);

    const result = await service.sendBookStatusUpdate({
      recipient: {
        userName: "Ada",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
      },
      bookTitle: "The Lagos Chronicle",
      newStatus: "PRINTING",
      dashboardUrl: "https://bookprinta.com/en/dashboard/books",
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalled();
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "book status update text fallback",
        text: expect.stringContaining(
          "View Book Details: https://bookprinta.com/en/dashboard/books"
        ),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        delivered: true,
        failureReason: null,
      })
    );
  });
});
