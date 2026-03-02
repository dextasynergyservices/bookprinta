import type { Locale } from "@bookprinta/emails";
import {
  renderSignupLinkEmail,
  renderSignupVerificationEmail,
  renderWelcomeEmail,
} from "@bookprinta/emails/render";
import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";

const FRONTEND_FALLBACK_URL = "https://bookprinta.com";
const RESEND_DEV_FROM = "BookPrinta <onboarding@resend.dev>";

type DeliveryResult = {
  emailDelivered: boolean;
  whatsappDelivered: boolean;
};

type DeliveryOptions = {
  requireDelivery?: boolean;
};

@Injectable()
export class SignupNotificationsService {
  private readonly logger = new Logger(SignupNotificationsService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly infobipBaseUrl: string;
  private readonly infobipApiKey: string;
  private readonly infobipWhatsAppFrom: string;
  private readonly fallbackFromEmail: string;

  constructor() {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = (process.env.FRONTEND_URL || FRONTEND_FALLBACK_URL).replace(/\/+$/, "");
    this.infobipBaseUrl = this.normalizeBaseUrl(process.env.INFOBIP_BASE_URL || "");
    this.infobipApiKey = process.env.INFOBIP_API_KEY || "";
    this.infobipWhatsAppFrom = process.env.INFOBIP_WHATSAPP_FROM || "";
    this.fallbackFromEmail =
      process.env.AUTH_FROM_EMAIL || process.env.PAYMENTS_FROM_EMAIL || RESEND_DEV_FROM;
  }

  async sendRegistrationLink(
    params: {
      email: string;
      name: string;
      token: string;
      locale: Locale;
      phoneNumber?: string | null;
      fromEmail: string;
    },
    options: DeliveryOptions = {}
  ): Promise<DeliveryResult> {
    const [emailDelivered, whatsappDelivered] = await Promise.all([
      this.sendRegistrationLinkEmail(params),
      this.sendRegistrationLinkWhatsApp(params),
    ]);

    if (options.requireDelivery && !emailDelivered && !whatsappDelivered) {
      throw new Error("Unable to deliver signup link via email or WhatsApp");
    }

    return { emailDelivered, whatsappDelivered };
  }

  async sendVerificationChallenge(
    params: {
      email: string;
      name: string;
      verificationCode: string;
      verificationToken: string;
      locale: Locale;
      phoneNumber?: string | null;
      fromEmail: string;
    },
    options: DeliveryOptions = {}
  ): Promise<DeliveryResult> {
    const [emailDelivered, whatsappDelivered] = await Promise.all([
      this.sendVerificationChallengeEmail(params),
      this.sendVerificationChallengeWhatsApp(params),
    ]);

    if ((options.requireDelivery ?? true) && !emailDelivered && !whatsappDelivered) {
      throw new Error("Unable to deliver verification challenge via email or WhatsApp");
    }

    return { emailDelivered, whatsappDelivered };
  }

  async sendWelcomeEmail(params: {
    email: string;
    name: string;
    locale: Locale;
    fromEmail: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — welcome email skipped");
      return false;
    }

    try {
      const dashboardUrl = this.buildDashboardUrl(params.locale);
      const rendered = await renderWelcomeEmail({
        locale: params.locale,
        userName: params.name,
        signupUrl: dashboardUrl,
      });

      const result = await this.resend.emails.send({
        from: this.resolveFromEmail(params.fromEmail),
        to: params.email,
        subject: rendered.subject,
        html: rendered.html,
      });

      if (result.error) {
        this.logger.error(
          `Failed to send welcome email: ${result.error.name} — ${result.error.message}`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Welcome email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private async sendRegistrationLinkEmail(params: {
    email: string;
    name: string;
    token: string;
    locale: Locale;
    fromEmail: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — signup link email skipped");
      return false;
    }

    const signupUrl = this.buildSignupFinishUrl(params.token, params.locale);
    const signupEmail = await renderSignupLinkEmail({
      locale: params.locale,
      userName: params.name,
      signupUrl,
    });

    try {
      const sendResult = await this.resend.emails.send({
        from: this.resolveFromEmail(params.fromEmail),
        to: params.email,
        subject: signupEmail.subject,
        html: signupEmail.html,
      });

      if (sendResult.error) {
        this.logger.error(
          `Failed to send signup link email: ${sendResult.error.name} — ${sendResult.error.message}`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Signup link email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private async sendRegistrationLinkWhatsApp(params: {
    phoneNumber?: string | null;
    name: string;
    token: string;
    locale: Locale;
  }): Promise<boolean> {
    if (!params.phoneNumber?.trim()) return false;

    if (!this.infobipBaseUrl || !this.infobipApiKey || !this.infobipWhatsAppFrom) {
      this.logger.warn("Infobip WhatsApp config missing — signup link WhatsApp skipped");
      return false;
    }

    const to = this.normalizeWhatsAppPhone(params.phoneNumber);
    if (!to) {
      this.logger.warn("Invalid phone number for signup link WhatsApp delivery");
      return false;
    }

    const signupUrl = this.buildSignupFinishUrl(params.token, params.locale);
    const text = this.buildRegistrationLinkWhatsAppMessage({
      locale: params.locale,
      name: params.name,
      token: params.token,
      signupUrl,
    });

    return this.sendInfobipTextMessage(to, text, "signup link");
  }

  private async sendVerificationChallengeEmail(params: {
    email: string;
    name: string;
    verificationCode: string;
    verificationToken: string;
    locale: Locale;
    fromEmail: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — signup verification email skipped");
      return false;
    }

    const verificationUrl = this.buildSignupFinishUrl(params.verificationToken, params.locale);
    const rendered = await renderSignupVerificationEmail({
      locale: params.locale,
      userName: params.name,
      verificationCode: params.verificationCode,
      verificationToken: params.verificationToken,
      verificationUrl,
    });

    try {
      const result = await this.resend.emails.send({
        from: this.resolveFromEmail(params.fromEmail),
        to: params.email,
        subject: rendered.subject,
        html: rendered.html,
      });

      if (result.error) {
        this.logger.error(
          `Failed to send signup verification email: ${result.error.name} — ${result.error.message}`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Signup verification email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private async sendVerificationChallengeWhatsApp(params: {
    phoneNumber?: string | null;
    name: string;
    verificationCode: string;
    verificationToken: string;
    locale: Locale;
  }): Promise<boolean> {
    if (!params.phoneNumber?.trim()) return false;

    if (!this.infobipBaseUrl || !this.infobipApiKey || !this.infobipWhatsAppFrom) {
      this.logger.warn("Infobip WhatsApp config missing — signup verification WhatsApp skipped");
      return false;
    }

    const to = this.normalizeWhatsAppPhone(params.phoneNumber);
    if (!to) {
      this.logger.warn("Invalid phone number for signup verification WhatsApp delivery");
      return false;
    }

    const verificationUrl = this.buildSignupFinishUrl(params.verificationToken, params.locale);
    const text = this.buildVerificationChallengeWhatsAppMessage({
      locale: params.locale,
      name: params.name,
      verificationCode: params.verificationCode,
      verificationToken: params.verificationToken,
      verificationUrl,
    });

    return this.sendInfobipTextMessage(to, text, "signup verification");
  }

  private async sendInfobipTextMessage(to: string, text: string, kind: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.infobipBaseUrl}/whatsapp/1/message/text`, {
        method: "POST",
        headers: {
          Authorization: `App ${this.infobipApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          from: this.infobipWhatsAppFrom,
          to,
          content: { text },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Infobip ${kind} WhatsApp failed (${response.status}): ${body}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Infobip ${kind} WhatsApp failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private normalizeWhatsAppPhone(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("+")) {
      const digits = trimmed.slice(1).replace(/\D/g, "");
      return digits ? `+${digits}` : "";
    }

    return trimmed.replace(/\D/g, "");
  }

  private buildRegistrationLinkWhatsAppMessage(params: {
    locale: Locale;
    name: string;
    token: string;
    signupUrl: string;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.name},\n\n` +
        `Votre lien d'inscription BookPrinta est pret.\n` +
        `Jeton: ${params.token}\n` +
        `Lien: ${params.signupUrl}\n\n` +
        `Ce lien expire dans 24 heures.`
      );
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.name},\n\n` +
        `Tu enlace de registro de BookPrinta esta listo.\n` +
        `Token: ${params.token}\n` +
        `Enlace: ${params.signupUrl}\n\n` +
        `Este enlace expira en 24 horas.`
      );
    }

    return (
      `Hi ${params.name},\n\n` +
      `Your BookPrinta signup link is ready.\n` +
      `Token: ${params.token}\n` +
      `Link: ${params.signupUrl}\n\n` +
      `This link expires in 24 hours.`
    );
  }

  private buildVerificationChallengeWhatsAppMessage(params: {
    locale: Locale;
    name: string;
    verificationCode: string;
    verificationToken: string;
    verificationUrl: string;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.name},\n\n` +
        `Votre code de verification BookPrinta: ${params.verificationCode}\n` +
        `Jeton: ${params.verificationToken}\n` +
        `Lien: ${params.verificationUrl}\n\n` +
        `Ce code expire dans 15 minutes.`
      );
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.name},\n\n` +
        `Tu codigo de verificacion de BookPrinta: ${params.verificationCode}\n` +
        `Token: ${params.verificationToken}\n` +
        `Enlace: ${params.verificationUrl}\n\n` +
        `Este codigo expira en 15 minutos.`
      );
    }

    return (
      `Hi ${params.name},\n\n` +
      `Your BookPrinta verification code: ${params.verificationCode}\n` +
      `Token: ${params.verificationToken}\n` +
      `Link: ${params.verificationUrl}\n\n` +
      `This code expires in 15 minutes.`
    );
  }

  private buildSignupFinishUrl(token: string, locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/signup/finish?token=${encodeURIComponent(token)}`;
  }

  private buildDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/dashboard`;
  }

  private resolveFromEmail(fromEmail: string): string {
    const normalized = fromEmail.trim();
    if (normalized.length > 0) return normalized;
    return this.fallbackFromEmail;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }
}
