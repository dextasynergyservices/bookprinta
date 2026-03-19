/// <reference types="jest" />

import { SignupNotificationsService } from "./signup-notifications.service.js";

describe("SignupNotificationsService", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = "https://bookprinta.com";
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("sends the signup_link template with order summary placeholders and token button", async () => {
    const whatsappService = {
      sendTemplate: jest.fn().mockResolvedValue({
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: "+2348012345678",
        providerMessageId: "wa-msg-1",
      }),
      sendText: jest.fn(),
    };

    const service = new SignupNotificationsService(whatsappService as never);
    const result = await service.sendRegistrationLink({
      email: "ada@example.com",
      name: "Adaeze",
      token: "ready_token_abc123",
      locale: "en",
      phoneNumber: "+2348012345678",
      fromEmail: "BookPrinta <info@bookprinta.com>",
      orderNumber: "BP-2026-0001",
      packageName: "Glow Up",
      amountPaid: "NGN 150,000",
      addons: ["Cover Design", "ISBN Registration"],
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+2348012345678",
        templateName: "signup_link",
        language: "en",
        kind: "signup link",
        bodyPlaceholders: [
          "Adaeze",
          "Glow Up",
          "BP-2026-0001",
          "NGN 150,000",
          "Cover Design, ISBN Registration",
        ],
        buttons: [{ type: "URL", parameter: "ready_token_abc123" }],
        callbackData: "ready_token_abc123",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        emailDelivered: false,
        whatsappDelivered: true,
      })
    );
  });

  it("falls back to a direct signup-link text when the template send fails", async () => {
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
        providerMessageId: "wa-msg-fallback-1",
      }),
    };

    const service = new SignupNotificationsService(whatsappService as never);
    const result = await service.sendRegistrationLink({
      email: "ada@example.com",
      name: "Adaeze",
      token: "ready_token_abc123",
      locale: "en",
      phoneNumber: "+2348012345678",
      fromEmail: "BookPrinta <info@bookprinta.com>",
      orderNumber: "BP-2026-0001",
      packageName: "Glow Up",
      amountPaid: "NGN 150,000",
      addons: ["Cover Design", "ISBN Registration"],
    });

    expect(whatsappService.sendTemplate).toHaveBeenCalled();
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "signup link text fallback",
        text: expect.stringContaining(
          "Complete Signup: https://bookprinta.com/en/signup/finish?token=ready_token_abc123"
        ),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        emailDelivered: false,
        whatsappDelivered: true,
        whatsappFailureReason: null,
      })
    );
  });
});
