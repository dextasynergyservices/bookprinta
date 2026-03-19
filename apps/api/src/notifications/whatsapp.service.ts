import { Injectable, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { normalizePhoneNumber } from "../auth/phone-number.util.js";

type WhatsappMessageMeta = Record<string, unknown>;

type WhatsappSendBaseParams = {
  to: string;
  kind: string;
  notifyUrl?: string | null;
  callbackData?: string | null;
  meta?: WhatsappMessageMeta;
};

type WhatsappTemplateParameter = string | number | boolean;

type WhatsappTemplateButton = {
  type: "COPY_CODE" | "QUICK_REPLY" | "URL";
  parameter: string;
};

export type WhatsappSendTextParams = WhatsappSendBaseParams & {
  text: string;
};

export type WhatsappSendTemplateParams = WhatsappSendBaseParams & {
  templateName: string;
  language: string;
  bodyPlaceholders?: WhatsappTemplateParameter[];
  headerPlaceholders?: WhatsappTemplateParameter[];
  buttons?: WhatsappTemplateButton[];
};

export type WhatsappSendResult = {
  attempted: boolean;
  delivered: boolean;
  failureReason: string | null;
  normalizedTo: string | null;
  providerMessageId: string | null;
};

type InfobipMessageResponse = {
  messages?: Array<{
    messageId?: string;
    status?: {
      description?: string;
      groupName?: string;
      name?: string;
    };
  }>;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly infobipBaseUrl: string;
  private readonly infobipApiKey: string;
  private readonly infobipWhatsAppFrom: string;

  constructor() {
    this.infobipBaseUrl = this.normalizeBaseUrl(
      process.env.INFOBIP_BASE_URL ||
        process.env.INFOBIP_API_BASE_URL ||
        process.env.INFOBIP_BASEURL ||
        ""
    );
    this.infobipApiKey =
      process.env.INFOBIP_API_KEY || process.env.INFOBIP_KEY || process.env.INFOBIP_APIKEY || "";
    this.infobipWhatsAppFrom =
      process.env.INFOBIP_WHATSAPP_FROM ||
      process.env.INFOBIP_WHATSAPP_SENDER ||
      process.env.INFOBIP_WHATSAPP_NUMBER ||
      "";
  }

  isConfigured(): boolean {
    return Boolean(this.infobipBaseUrl && this.infobipApiKey && this.infobipWhatsAppFrom);
  }

  normalizePhone(value: string | null | undefined): string {
    return normalizePhoneNumber(value) ?? "";
  }

  async sendText(params: WhatsappSendTextParams): Promise<WhatsappSendResult> {
    const normalizedTo = this.normalizePhone(params.to);
    if (!normalizedTo) {
      this.logger.warn(`Invalid phone number for ${params.kind} WhatsApp delivery`);
      return this.buildSkippedResult("Invalid phone number");
    }

    const text = params.text.trim();
    if (!text) {
      this.logger.warn(`WhatsApp text payload empty — ${params.kind} skipped`);
      return this.buildSkippedResult("Message text is required");
    }

    if (!this.isConfigured()) {
      this.logMissingInfobipConfig(params.kind);
      return this.buildSkippedResult("Infobip WhatsApp config missing");
    }

    return this.postMessage(
      `${this.infobipBaseUrl}/whatsapp/1/message/text`,
      {
        from: this.infobipWhatsAppFrom,
        to: normalizedTo,
        content: { text },
        ...this.buildDeliveryFields(params),
      },
      {
        kind: params.kind,
        meta: params.meta,
        normalizedTo,
      }
    );
  }

  async sendTemplate(params: WhatsappSendTemplateParams): Promise<WhatsappSendResult> {
    const normalizedTo = this.normalizePhone(params.to);
    if (!normalizedTo) {
      this.logger.warn(`Invalid phone number for ${params.kind} WhatsApp delivery`);
      return this.buildSkippedResult("Invalid phone number");
    }

    const templateName = params.templateName.trim();
    if (!templateName) {
      this.logger.warn(`WhatsApp template name missing — ${params.kind} skipped`);
      return this.buildSkippedResult("Template name is required");
    }

    const language = params.language.trim();
    if (!language) {
      this.logger.warn(`WhatsApp template language missing — ${params.kind} skipped`);
      return this.buildSkippedResult("Template language is required");
    }

    if (!this.isConfigured()) {
      this.logMissingInfobipConfig(params.kind);
      return this.buildSkippedResult("Infobip WhatsApp config missing");
    }

    return this.postMessage(
      `${this.infobipBaseUrl}/whatsapp/1/message/template`,
      {
        messages: [
          {
            from: this.infobipWhatsAppFrom,
            to: normalizedTo,
            content: {
              templateName,
              language,
              templateData: this.buildTemplateData(params),
            },
            ...this.buildDeliveryFields(params),
          },
        ],
      },
      {
        kind: params.kind,
        meta: {
          templateName,
          language,
          ...(params.meta ?? {}),
        },
        normalizedTo,
      }
    );
  }

  async sendMessage(
    to: string,
    templateName: string,
    params: Omit<WhatsappSendTemplateParams, "templateName" | "to">
  ): Promise<WhatsappSendResult> {
    return this.sendTemplate({
      ...params,
      to,
      templateName,
    });
  }

  private async postMessage(
    url: string,
    payload: Record<string, unknown>,
    context: {
      kind: string;
      meta?: WhatsappMessageMeta;
      normalizedTo: string;
    }
  ): Promise<WhatsappSendResult> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `App ${this.infobipApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.text();
      const parsed = this.safeParseResponse(body);
      const providerMessageId = parsed?.messages?.[0]?.messageId ?? null;

      if (!response.ok) {
        const error = new Error(
          `Infobip ${context.kind} WhatsApp failed (${response.status}) for ${context.normalizedTo}: ${body}`
        );
        this.logger.error(error.message);
        this.captureFailure(error, context);
        return {
          attempted: true,
          delivered: false,
          failureReason: this.buildFailureReason(response.status, body, parsed),
          normalizedTo: context.normalizedTo,
          providerMessageId,
        };
      }

      return {
        attempted: true,
        delivered: true,
        failureReason: null,
        normalizedTo: context.normalizedTo,
        providerMessageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown WhatsApp delivery error occurred";
      this.logger.error(
        `Infobip ${context.kind} WhatsApp failed for ${context.normalizedTo}: ${message}`
      );
      this.captureFailure(error, context);
      return {
        attempted: true,
        delivered: false,
        failureReason: message,
        normalizedTo: context.normalizedTo,
        providerMessageId: null,
      };
    }
  }

  private buildTemplateData(params: WhatsappSendTemplateParams): Record<string, unknown> {
    const templateData: Record<string, unknown> = {};

    if ((params.headerPlaceholders?.length ?? 0) > 0) {
      templateData.header = {
        placeholders: params.headerPlaceholders?.map((value) => String(value)),
      };
    }

    if ((params.bodyPlaceholders?.length ?? 0) > 0) {
      templateData.body = {
        placeholders: params.bodyPlaceholders?.map((value) => String(value)),
      };
    }

    if ((params.buttons?.length ?? 0) > 0) {
      templateData.buttons = params.buttons;
    }

    return templateData;
  }

  private buildDeliveryFields(params: {
    notifyUrl?: string | null;
    callbackData?: string | null;
  }): Record<string, string> {
    const deliveryFields: Record<string, string> = {};
    const notifyUrl = params.notifyUrl?.trim();
    const callbackData = params.callbackData?.trim();

    if (notifyUrl) {
      deliveryFields.notifyUrl = notifyUrl;
    }

    if (callbackData) {
      deliveryFields.callbackData = callbackData;
    }

    return deliveryFields;
  }

  private buildSkippedResult(failureReason: string): WhatsappSendResult {
    return {
      attempted: false,
      delivered: false,
      failureReason,
      normalizedTo: null,
      providerMessageId: null,
    };
  }

  private buildFailureReason(
    status: number,
    body: string,
    parsed: InfobipMessageResponse | null
  ): string {
    const providerDescription = parsed?.messages?.[0]?.status?.description?.trim();
    if (providerDescription) {
      return `${status}: ${providerDescription}`;
    }

    const normalizedBody = body.trim();
    if (!normalizedBody) {
      return `Infobip request failed with status ${status}`;
    }

    return normalizedBody.length > 220 ? `${normalizedBody.slice(0, 217)}...` : normalizedBody;
  }

  private captureFailure(
    error: unknown,
    context: {
      kind: string;
      meta?: WhatsappMessageMeta;
      normalizedTo: string;
    }
  ): void {
    Sentry.withScope((scope) => {
      scope.setTag("channel", "whatsapp");
      scope.setTag("provider", "infobip");
      scope.setTag("notification_kind", context.kind);
      scope.setContext("whatsapp", {
        to: context.normalizedTo,
        ...(context.meta ?? {}),
      });
      Sentry.captureException(error);
    });
  }

  private logMissingInfobipConfig(kind: string): void {
    const missing: string[] = [];
    if (!this.infobipBaseUrl) missing.push("INFOBIP_BASE_URL");
    if (!this.infobipApiKey) missing.push("INFOBIP_API_KEY");
    if (!this.infobipWhatsAppFrom) missing.push("INFOBIP_WHATSAPP_FROM");
    const details = missing.length > 0 ? ` (${missing.join(", ")})` : "";
    this.logger.warn(`Infobip WhatsApp config missing${details} — ${kind} WhatsApp skipped`);
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  private safeParseResponse(body: string): InfobipMessageResponse | null {
    const normalized = body.trim();
    if (!normalized) return null;

    try {
      return JSON.parse(normalized) as InfobipMessageResponse;
    } catch {
      return null;
    }
  }
}
