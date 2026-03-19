import type { Locale } from "@bookprinta/emails";
import {
  renderSignupLinkEmail,
  renderSignupVerificationEmail,
  renderWelcomeEmail,
} from "@bookprinta/emails/render";
import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { isUserNotificationChannelEnabled } from "./notification-preference-policy.js";
import { WhatsappService } from "./whatsapp.service.js";

const DEFAULT_FROM_EMAIL = "BookPrinta <info@bookprinta.com>";
const SIGNUP_LINK_TEMPLATE_NAME = "signup_link";

type DeliveryResult = {
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  emailFailureReason?: string | null;
  whatsappFailureReason?: string | null;
  attemptedAt?: string;
};

type DeliveryOptions = {
  requireDelivery?: boolean;
};

type ChannelDeliveryResult = {
  delivered: boolean;
  failureReason: string | null;
};

@Injectable()
export class SignupNotificationsService {
  private readonly logger = new Logger(SignupNotificationsService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly fallbackFromEmail: string;

  constructor(private readonly whatsappService: WhatsappService = new WhatsappService()) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.fallbackFromEmail =
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      process.env.ADMIN_FROM_EMAIL ||
      DEFAULT_FROM_EMAIL;
  }

  async sendRegistrationLink(
    params: {
      email: string;
      name: string;
      token: string;
      locale: Locale;
      phoneNumber?: string | null;
      fromEmail: string;
      orderNumber?: string;
      packageName?: string;
      amountPaid?: string;
      addons?: string[];
    },
    options: DeliveryOptions = {}
  ): Promise<DeliveryResult> {
    const attemptedAt = new Date().toISOString();
    const [emailResult, whatsappResult] = await Promise.all([
      this.sendRegistrationLinkEmail(params),
      this.sendRegistrationLinkWhatsApp(params),
    ]);
    const emailDelivered = emailResult.delivered;
    const whatsappDelivered = whatsappResult.delivered;

    if (options.requireDelivery && !emailDelivered && !whatsappDelivered) {
      throw new Error("Unable to deliver signup link via email or WhatsApp");
    }

    return {
      emailDelivered,
      whatsappDelivered,
      emailFailureReason: emailResult.failureReason,
      whatsappFailureReason: whatsappResult.failureReason,
      attemptedAt,
    };
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
    const attemptedAt = new Date().toISOString();
    const [emailResult, whatsappResult] = await Promise.all([
      this.sendVerificationChallengeEmail(params),
      this.sendVerificationChallengeWhatsApp(params),
    ]);
    const emailDelivered = emailResult.delivered;
    const whatsappDelivered = whatsappResult.delivered;

    if ((options.requireDelivery ?? true) && !emailDelivered && !whatsappDelivered) {
      throw new Error("Unable to deliver verification challenge via email or WhatsApp");
    }

    return {
      emailDelivered,
      whatsappDelivered,
      emailFailureReason: emailResult.failureReason,
      whatsappFailureReason: whatsappResult.failureReason,
      attemptedAt,
    };
  }

  async sendWelcomeEmail(params: {
    email: string;
    name: string;
    locale: Locale;
    fromEmail: string;
    emailNotificationsEnabled?: boolean | null;
    orderNumber?: string;
    packageName?: string;
    amountPaid?: string;
    addons?: string[];
  }): Promise<boolean> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.emailNotificationsEnabled,
        kind: "welcome",
      })
    ) {
      return false;
    }

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — welcome email skipped");
      return false;
    }

    try {
      const dashboardUrl = this.buildDashboardUrl(params.locale);
      const rendered = await renderWelcomeEmail({
        locale: params.locale,
        userName: params.name,
        dashboardUrl,
        orderNumber: params.orderNumber,
        packageName: params.packageName,
        amountPaid: params.amountPaid,
        addons: params.addons,
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
    orderNumber?: string;
    packageName?: string;
    amountPaid?: string;
    addons?: string[];
  }): Promise<ChannelDeliveryResult> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — signup link email skipped");
      return {
        delivered: false,
        failureReason: "RESEND_API_KEY not set",
      };
    }

    const signupUrl = this.buildSignupFinishUrl(params.token, params.locale);
    const signupEmail = await renderSignupLinkEmail({
      locale: params.locale,
      userName: params.name,
      signupUrl,
      orderNumber: params.orderNumber,
      packageName: params.packageName,
      amountPaid: params.amountPaid,
      addons: params.addons,
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
        return {
          delivered: false,
          failureReason: `${sendResult.error.name}: ${sendResult.error.message}`,
        };
      }

      return {
        delivered: true,
        failureReason: null,
      };
    } catch (error) {
      this.logger.error(
        `Signup link email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        delivered: false,
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sendRegistrationLinkWhatsApp(params: {
    phoneNumber?: string | null;
    name: string;
    token: string;
    locale: Locale;
    orderNumber?: string;
    packageName?: string;
    amountPaid?: string;
    addons?: string[];
  }): Promise<ChannelDeliveryResult> {
    if (!params.phoneNumber?.trim()) {
      return {
        delivered: false,
        failureReason: "Phone number not provided",
      };
    }

    const signupUrl = this.buildSignupFinishUrl(params.token, params.locale);
    const result = await this.whatsappService.sendTemplate({
      to: params.phoneNumber,
      templateName: SIGNUP_LINK_TEMPLATE_NAME,
      language: params.locale,
      kind: "signup link",
      bodyPlaceholders: [
        this.normalizeTemplateValue(params.name, "Author"),
        this.resolveSignupTemplatePackageName(params.packageName, params.locale),
        this.resolveSignupTemplateOrderNumber(params.orderNumber, params.locale),
        this.resolveSignupTemplateAmount(params.amountPaid, params.locale),
        this.resolveSignupTemplateAddons(params.addons, params.locale),
      ],
      buttons: [{ type: "URL", parameter: params.token }],
      callbackData: params.token,
      meta: {
        flow: "signup_link",
        locale: params.locale,
      },
    });

    if (result.delivered || !result.attempted) {
      return {
        delivered: result.delivered,
        failureReason: result.failureReason,
      };
    }

    const fallbackResult = await this.whatsappService.sendText({
      to: params.phoneNumber,
      kind: "signup link text fallback",
      text: this.buildRegistrationLinkWhatsAppMessage({
        locale: params.locale,
        name: this.normalizeTemplateValue(params.name, "Author"),
        signupUrl,
        packageName: this.resolveSignupTemplatePackageName(params.packageName, params.locale),
        orderNumber: this.resolveSignupTemplateOrderNumber(params.orderNumber, params.locale),
        amountPaid: this.resolveSignupTemplateAmount(params.amountPaid, params.locale),
        addons: this.resolveSignupTemplateAddons(params.addons, params.locale),
      }),
      callbackData: params.token,
      meta: {
        flow: "signup_link",
        locale: params.locale,
        templateName: SIGNUP_LINK_TEMPLATE_NAME,
        templateFailureReason: result.failureReason,
        fallbackChannel: "text",
      },
    });

    if (fallbackResult.delivered) {
      return {
        delivered: true,
        failureReason: null,
      };
    }

    return {
      delivered: false,
      failureReason: [result.failureReason, fallbackResult.failureReason]
        .filter((value): value is string => Boolean(value))
        .join(" | "),
    };
  }

  private async sendVerificationChallengeEmail(params: {
    email: string;
    name: string;
    verificationCode: string;
    verificationToken: string;
    locale: Locale;
    fromEmail: string;
  }): Promise<ChannelDeliveryResult> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — signup verification email skipped");
      return {
        delivered: false,
        failureReason: "RESEND_API_KEY not set",
      };
    }

    const verificationUrl = this.buildVerificationUrl(params.verificationToken, params.locale);
    const rendered = await renderSignupVerificationEmail({
      locale: params.locale,
      userName: params.name,
      verificationCode: params.verificationCode,
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
        return {
          delivered: false,
          failureReason: `${result.error.name}: ${result.error.message}`,
        };
      }

      return {
        delivered: true,
        failureReason: null,
      };
    } catch (error) {
      this.logger.error(
        `Signup verification email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        delivered: false,
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sendVerificationChallengeWhatsApp(params: {
    phoneNumber?: string | null;
    name: string;
    verificationCode: string;
    verificationToken: string;
    locale: Locale;
  }): Promise<ChannelDeliveryResult> {
    if (!params.phoneNumber?.trim()) {
      return {
        delivered: false,
        failureReason: "Phone number not provided",
      };
    }

    const verificationUrl = this.buildVerificationUrl(params.verificationToken, params.locale);
    const text = this.buildVerificationChallengeWhatsAppMessage({
      locale: params.locale,
      name: params.name,
      verificationCode: params.verificationCode,
      verificationToken: params.verificationToken,
      verificationUrl,
    });

    const result = await this.whatsappService.sendText({
      to: params.phoneNumber,
      text,
      kind: "signup verification",
      callbackData: params.verificationToken,
      meta: {
        flow: "signup_verification",
        locale: params.locale,
      },
    });

    return {
      delivered: result.delivered,
      failureReason: result.failureReason,
    };
  }

  private buildRegistrationLinkWhatsAppMessage(params: {
    locale: Locale;
    name: string;
    signupUrl: string;
    packageName: string;
    orderNumber: string;
    amountPaid: string;
    addons: string;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.name},\n\n` +
        `Completez votre compte\n\n` +
        `Votre paiement a ete recu ! Completez votre compte pour commencer.\n\n` +
        `Resume de la commande\n` +
        `Forfait: ${params.packageName}\n` +
        `Numero de commande: ${params.orderNumber}\n` +
        `Montant paye: ${params.amountPaid}\n` +
        `Services supplementaires: ${params.addons}\n\n` +
        `Utilisez le lien ci-dessous pour terminer la configuration de votre compte BookPrinta. Vous devrez definir un mot de passe et verifier votre email.\n` +
        `Completer l'inscription: ${params.signupUrl}\n\n` +
        `Ce lien expire dans 24 heures.`
      );
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.name},\n\n` +
        `Completa tu cuenta\n\n` +
        `¡Tu pago ha sido recibido! Completa tu cuenta para comenzar.\n\n` +
        `Resumen del pedido\n` +
        `Paquete: ${params.packageName}\n` +
        `Numero de pedido: ${params.orderNumber}\n` +
        `Monto pagado: ${params.amountPaid}\n` +
        `Servicios adicionales: ${params.addons}\n\n` +
        `Usa el enlace de abajo para terminar de configurar tu cuenta de BookPrinta. Necesitaras establecer una contrasena y verificar tu correo electronico.\n` +
        `Completar registro: ${params.signupUrl}\n\n` +
        `Este enlace expira en 24 horas.`
      );
    }

    return (
      `Hi ${params.name},\n\n` +
      `Your payment has been received! Complete your account to get started.\n\n` +
      `Order Summary\n` +
      `Package: ${params.packageName}\n` +
      `Order Number: ${params.orderNumber}\n` +
      `Amount Paid: ${params.amountPaid}\n` +
      `Extra Services: ${params.addons}\n\n` +
      `Use the link below to finish setting up your BookPrinta account. You'll need to set a password and verify your email.\n` +
      `Complete Signup: ${params.signupUrl}\n\n` +
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

  private buildVerificationUrl(token: string, locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/signup/finish?token=${encodeURIComponent(token)}&step=verify`;
  }

  private buildDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/dashboard`;
  }

  private resolveSignupTemplatePackageName(value: string | undefined, locale: Locale): string {
    const normalized = value?.trim();
    if (normalized) return normalized;
    if (locale === "fr") return "Commande BookPrinta";
    if (locale === "es") return "Pedido BookPrinta";
    return "BookPrinta Order";
  }

  private resolveSignupTemplateOrderNumber(value: string | undefined, locale: Locale): string {
    const normalized = value?.trim();
    if (normalized) return normalized;
    if (locale === "fr") return "En attente";
    if (locale === "es") return "Pendiente";
    return "Pending";
  }

  private resolveSignupTemplateAmount(value: string | undefined, locale: Locale): string {
    const normalized = value?.trim();
    if (normalized) return normalized;
    if (locale === "fr") return "A confirmer";
    if (locale === "es") return "Por confirmar";
    return "To be confirmed";
  }

  private resolveSignupTemplateAddons(value: string[] | undefined, locale: Locale): string {
    if (Array.isArray(value) && value.length > 0) {
      return value.join(", ");
    }

    if (locale === "fr") return "Aucun service supplementaire";
    if (locale === "es") return "Sin servicios adicionales";
    return "No extra services";
  }

  private normalizeTemplateValue(value: string, fallback: string): string {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private resolveFromEmail(fromEmail: string): string {
    const normalized = fromEmail.trim();
    if (normalized.length > 0) return normalized;
    return this.fallbackFromEmail;
  }

  private resolveFrontendBaseUrl(): string {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) {
      throw new Error(
        "FRONTEND_URL environment variable is required for signup notification links"
      );
    }
    return raw.replace(/\/+$/, "");
  }
}
