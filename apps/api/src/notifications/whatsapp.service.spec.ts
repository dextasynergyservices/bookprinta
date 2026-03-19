/// <reference types="jest" />
import { WhatsappService } from "./whatsapp.service.js";

describe("WhatsappService", () => {
  const originalInfobipBaseUrl = process.env.INFOBIP_BASE_URL;
  const originalInfobipApiBaseUrl = process.env.INFOBIP_API_BASE_URL;
  const originalInfobipBaseUrlAlt = process.env.INFOBIP_BASEURL;
  const originalInfobipApiKey = process.env.INFOBIP_API_KEY;
  const originalInfobipKey = process.env.INFOBIP_KEY;
  const originalInfobipApiKeyAlt = process.env.INFOBIP_APIKEY;
  const originalInfobipWhatsAppFrom = process.env.INFOBIP_WHATSAPP_FROM;
  const originalInfobipWhatsAppSender = process.env.INFOBIP_WHATSAPP_SENDER;
  const originalInfobipWhatsAppNumber = process.env.INFOBIP_WHATSAPP_NUMBER;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.INFOBIP_BASE_URL;
    delete process.env.INFOBIP_API_BASE_URL;
    delete process.env.INFOBIP_BASEURL;
    delete process.env.INFOBIP_API_KEY;
    delete process.env.INFOBIP_KEY;
    delete process.env.INFOBIP_APIKEY;
    delete process.env.INFOBIP_WHATSAPP_FROM;
    delete process.env.INFOBIP_WHATSAPP_SENDER;
    delete process.env.INFOBIP_WHATSAPP_NUMBER;
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env.INFOBIP_BASE_URL = originalInfobipBaseUrl;
    process.env.INFOBIP_API_BASE_URL = originalInfobipApiBaseUrl;
    process.env.INFOBIP_BASEURL = originalInfobipBaseUrlAlt;
    process.env.INFOBIP_API_KEY = originalInfobipApiKey;
    process.env.INFOBIP_KEY = originalInfobipKey;
    process.env.INFOBIP_APIKEY = originalInfobipApiKeyAlt;
    process.env.INFOBIP_WHATSAPP_FROM = originalInfobipWhatsAppFrom;
    process.env.INFOBIP_WHATSAPP_SENDER = originalInfobipWhatsAppSender;
    process.env.INFOBIP_WHATSAPP_NUMBER = originalInfobipWhatsAppNumber;
    global.fetch = originalFetch;
  });

  it("normalizes WhatsApp phone numbers using the shared phone utility", () => {
    const service = new WhatsappService();

    expect(service.normalizePhone("0801 234 5678")).toBe("+2348012345678");
    expect(service.normalizePhone("2348012345678")).toBe("+2348012345678");
    expect(service.normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("skips delivery when InfoBip config is missing", async () => {
    const service = new WhatsappService();

    const result = await service.sendText({
      to: "+2348012345678",
      text: "Hello from BookPrinta",
      kind: "signup link",
    });

    expect(result).toEqual({
      attempted: false,
      delivered: false,
      failureReason: "Infobip WhatsApp config missing",
      normalizedTo: null,
      providerMessageId: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends text messages with notifyUrl and callbackData when provided", async () => {
    process.env.INFOBIP_BASE_URL = "https://example.api.infobip.com";
    process.env.INFOBIP_API_KEY = "test-api-key";
    process.env.INFOBIP_WHATSAPP_FROM = "447860099299";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ messageId: "msg-text-1" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    ) as unknown as typeof fetch;

    const service = new WhatsappService();
    const result = await service.sendText({
      to: "08012345678",
      text: "Your BookPrinta signup link is ready.",
      kind: "signup link",
      notifyUrl: "https://bookprinta.com/api/v1/notifications/whatsapp/reports",
      callbackData: "signup-token-123",
    });

    expect(result).toEqual({
      attempted: true,
      delivered: true,
      failureReason: null,
      normalizedTo: "+2348012345678",
      providerMessageId: "msg-text-1",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const payload = JSON.parse(String(init.body)) as {
      callbackData: string;
      content: { text: string };
      from: string;
      notifyUrl: string;
      to: string;
    };

    expect(url).toBe("https://example.api.infobip.com/whatsapp/1/message/text");
    expect(init.method).toBe("POST");
    expect(payload).toEqual({
      from: "447860099299",
      to: "+2348012345678",
      content: {
        text: "Your BookPrinta signup link is ready.",
      },
      notifyUrl: "https://bookprinta.com/api/v1/notifications/whatsapp/reports",
      callbackData: "signup-token-123",
    });
  });

  it("sends template messages with placeholder data", async () => {
    process.env.INFOBIP_BASE_URL = "https://example.api.infobip.com";
    process.env.INFOBIP_API_KEY = "test-api-key";
    process.env.INFOBIP_WHATSAPP_FROM = "447860099299";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ messageId: "msg-template-1" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    ) as unknown as typeof fetch;

    const service = new WhatsappService();
    const result = await service.sendTemplate({
      to: "+2348012345678",
      templateName: "payment_confirmation",
      language: "en",
      kind: "payment confirmation",
      bodyPlaceholders: ["Ada", "BP-2026-0001", "N125,000"],
      buttons: [{ type: "URL", parameter: "pay-now" }],
    });

    expect(result).toEqual({
      attempted: true,
      delivered: true,
      failureReason: null,
      normalizedTo: "+2348012345678",
      providerMessageId: "msg-template-1",
    });

    const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const payload = JSON.parse(String(init.body)) as {
      messages: Array<{
        content: {
          language: string;
          templateData: {
            body: { placeholders: string[] };
            buttons: Array<{ parameter: string; type: string }>;
          };
          templateName: string;
        };
        from: string;
        to: string;
      }>;
    };

    expect(url).toBe("https://example.api.infobip.com/whatsapp/1/message/template");
    expect(payload.messages).toEqual([
      {
        from: "447860099299",
        to: "+2348012345678",
        content: {
          templateName: "payment_confirmation",
          language: "en",
          templateData: {
            body: {
              placeholders: ["Ada", "BP-2026-0001", "N125,000"],
            },
            buttons: [{ type: "URL", parameter: "pay-now" }],
          },
        },
      },
    ]);
  });
});
