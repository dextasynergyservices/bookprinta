import type { Locale } from "@bookprinta/emails";
import { Injectable, Optional } from "@nestjs/common";
import { isUserNotificationChannelEnabled } from "./notification-preference-policy.js";
import {
  type WhatsappSendResult,
  type WhatsappSendTemplateParams,
  WhatsappService,
} from "./whatsapp.service.js";

type UserWhatsappRecipient = {
  userName: string;
  phoneNumber?: string | null;
  preferredLanguage?: string | null;
  whatsAppNotificationsEnabled?: boolean | null;
};

const WHATSAPP_TEMPLATE_NAMES = {
  bankTransferUser: "bank_transfer_user",
  bookStatusUpdate: "book_status_update",
  refundConfirm: "refund_confirm",
  manuscriptRejected: "manuscript_rejected",
} as const;

@Injectable()
export class WhatsappNotificationsService {
  constructor(
    @Optional()
    private readonly whatsappService: WhatsappService = new WhatsappService()
  ) {}

  async sendPaymentConfirmation(params: {
    recipient: UserWhatsappRecipient;
    orderNumber: string;
    amountLabel: string;
    packageName: string;
    addons?: string[];
    dashboardUrl?: string | null;
    variant?: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer";
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);
    const addonsLabel = params.addons && params.addons.length > 0 ? params.addons.join(", ") : null;

    return this.sendUserTextMessage({
      recipient: params.recipient,
      kind: "payment confirmation",
      preferenceKind: "payment_confirmation",
      callbackData: params.orderNumber,
      meta: {
        locale,
        orderNumber: params.orderNumber,
        variant: params.variant ?? "standard",
      },
      text: this.buildPaymentConfirmationMessage({
        locale,
        userName: this.normalizeUserName(params.recipient.userName),
        orderNumber: params.orderNumber,
        amountLabel: params.amountLabel,
        packageName: params.packageName,
        addonsLabel,
        dashboardUrl: params.dashboardUrl ?? null,
        variant: params.variant ?? "standard",
      }),
    });
  }

  async sendBankTransferVerification(params: {
    recipient: UserWhatsappRecipient;
    orderNumber: string;
    amountLabel: string;
    expectedWaitTime: string;
    packageName?: string | null;
    addons?: string[];
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);
    const userName = this.normalizeUserName(params.recipient.userName);
    const packageName = this.resolveBankTransferPackageName(params.packageName, locale);
    const addonsLabel = this.resolveAddonsLabel(params.addons, locale, "addons");

    return this.sendUserTemplateMessageWithTextFallback({
      recipient: params.recipient,
      kind: "bank transfer verification",
      preferenceKind: "bank_transfer_receipt",
      templateName: WHATSAPP_TEMPLATE_NAMES.bankTransferUser,
      language: locale,
      callbackData: params.orderNumber,
      meta: {
        locale,
        orderNumber: params.orderNumber,
      },
      bodyPlaceholders: [
        userName,
        packageName,
        params.orderNumber,
        params.amountLabel,
        addonsLabel,
      ],
      fallbackText: this.buildBankTransferVerificationMessage({
        locale,
        userName,
        orderNumber: params.orderNumber,
        amountLabel: params.amountLabel,
        packageName,
        addonsLabel,
      }),
    });
  }

  async sendRefundConfirmation(params: {
    recipient: UserWhatsappRecipient;
    orderNumber: string;
    originalAmountLabel: string;
    refundAmountLabel: string;
    refundReason: string;
    dashboardUrl?: string | null;
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);
    const userName = this.normalizeUserName(params.recipient.userName);

    return this.sendUserTemplateMessageWithTextFallback({
      recipient: params.recipient,
      kind: "refund confirmation",
      preferenceKind: "refund_confirmation",
      templateName: WHATSAPP_TEMPLATE_NAMES.refundConfirm,
      language: locale,
      callbackData: params.orderNumber,
      meta: {
        locale,
        orderNumber: params.orderNumber,
      },
      bodyPlaceholders: [
        userName,
        params.orderNumber,
        params.originalAmountLabel,
        params.refundAmountLabel,
        params.refundReason,
      ],
      fallbackText: this.buildRefundConfirmationMessage({
        locale,
        userName,
        orderNumber: params.orderNumber,
        originalAmountLabel: params.originalAmountLabel,
        refundAmountLabel: params.refundAmountLabel,
        refundReason: params.refundReason,
      }),
    });
  }

  async sendBookStatusUpdate(params: {
    recipient: UserWhatsappRecipient;
    bookTitle: string;
    newStatus: string;
    dashboardUrl?: string | null;
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);
    const userName = this.normalizeUserName(params.recipient.userName);
    const statusLabel = this.resolveStatusLabel(params.newStatus, locale);

    return this.sendUserTemplateMessageWithTextFallback({
      recipient: params.recipient,
      kind: "book status update",
      preferenceKind: "book_status_update",
      templateName: WHATSAPP_TEMPLATE_NAMES.bookStatusUpdate,
      language: locale,
      callbackData: params.newStatus,
      meta: {
        locale,
        status: params.newStatus,
      },
      bodyPlaceholders: [userName, params.bookTitle, statusLabel],
      fallbackText: this.buildBookStatusMessage({
        locale,
        userName,
        bookTitle: params.bookTitle,
        statusLabel,
        dashboardUrl: params.dashboardUrl ?? null,
      }),
    });
  }

  async sendShippingNotification(params: {
    recipient: UserWhatsappRecipient;
    bookTitle: string;
    orderNumber: string;
    trackingNumber: string;
    shippingProvider?: string | null;
    trackingUrl?: string | null;
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);

    return this.sendUserTextMessage({
      recipient: params.recipient,
      kind: "shipping notification",
      preferenceKind: "shipping_notification",
      callbackData: params.orderNumber,
      meta: {
        locale,
        orderNumber: params.orderNumber,
        trackingNumber: params.trackingNumber,
      },
      text: this.buildShippingMessage({
        locale,
        userName: this.normalizeUserName(params.recipient.userName),
        bookTitle: params.bookTitle,
        orderNumber: params.orderNumber,
        trackingNumber: params.trackingNumber,
        shippingProvider: params.shippingProvider ?? null,
        trackingUrl: params.trackingUrl ?? null,
      }),
    });
  }

  async sendManuscriptRejected(params: {
    recipient: UserWhatsappRecipient;
    bookTitle: string;
    rejectionReason: string;
    dashboardUrl?: string | null;
  }): Promise<WhatsappSendResult> {
    const locale = this.resolveLocale(params.recipient.preferredLanguage);
    const userName = this.normalizeUserName(params.recipient.userName);

    return this.sendUserTemplateMessageWithTextFallback({
      recipient: params.recipient,
      kind: "manuscript rejected",
      preferenceKind: "manuscript_rejected",
      templateName: WHATSAPP_TEMPLATE_NAMES.manuscriptRejected,
      language: locale,
      callbackData: params.bookTitle,
      meta: {
        locale,
        bookTitle: params.bookTitle,
      },
      bodyPlaceholders: [userName, params.bookTitle, params.rejectionReason],
      fallbackText: this.buildManuscriptRejectedMessage({
        locale,
        userName,
        bookTitle: params.bookTitle,
        rejectionReason: params.rejectionReason,
        dashboardUrl: params.dashboardUrl ?? null,
      }),
    });
  }

  private async sendUserTextMessage(params: {
    recipient: UserWhatsappRecipient;
    kind: string;
    preferenceKind:
      | "bank_transfer_receipt"
      | "book_status_update"
      | "manuscript_rejected"
      | "payment_confirmation"
      | "refund_confirmation"
      | "shipping_notification";
    text: string;
    callbackData?: string;
    meta?: Record<string, unknown>;
  }): Promise<WhatsappSendResult> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.recipient.whatsAppNotificationsEnabled,
        kind: params.preferenceKind,
      })
    ) {
      return this.buildSkippedResult("User WhatsApp notifications disabled");
    }

    const phoneNumber = params.recipient.phoneNumber?.trim();
    if (!phoneNumber) {
      return this.buildSkippedResult("Phone number not provided");
    }

    return this.whatsappService.sendText({
      to: phoneNumber,
      text: params.text,
      kind: params.kind,
      callbackData: params.callbackData,
      meta: params.meta,
    });
  }

  private async sendUserTemplateMessage(
    params: {
      recipient: UserWhatsappRecipient;
      kind: string;
      preferenceKind:
        | "bank_transfer_receipt"
        | "book_status_update"
        | "manuscript_rejected"
        | "payment_confirmation"
        | "refund_confirmation"
        | "shipping_notification";
    } & Omit<WhatsappSendTemplateParams, "to" | "kind">
  ): Promise<WhatsappSendResult> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.recipient.whatsAppNotificationsEnabled,
        kind: params.preferenceKind,
      })
    ) {
      return this.buildSkippedResult("User WhatsApp notifications disabled");
    }

    const phoneNumber = params.recipient.phoneNumber?.trim();
    if (!phoneNumber) {
      return this.buildSkippedResult("Phone number not provided");
    }

    return this.whatsappService.sendTemplate({
      ...params,
      to: phoneNumber,
      kind: params.kind,
    });
  }

  private async sendUserTemplateMessageWithTextFallback(
    params: {
      recipient: UserWhatsappRecipient;
      kind: string;
      preferenceKind:
        | "bank_transfer_receipt"
        | "book_status_update"
        | "manuscript_rejected"
        | "payment_confirmation"
        | "refund_confirmation"
        | "shipping_notification";
      fallbackText: string;
    } & Omit<WhatsappSendTemplateParams, "to" | "kind">
  ): Promise<WhatsappSendResult> {
    const templateResult = await this.sendUserTemplateMessage(params);
    if (templateResult.delivered || !templateResult.attempted) {
      return templateResult;
    }

    const textResult = await this.sendUserTextMessage({
      recipient: params.recipient,
      kind: `${params.kind} text fallback`,
      preferenceKind: params.preferenceKind,
      text: params.fallbackText,
      callbackData: params.callbackData ?? undefined,
      meta: {
        ...(params.meta ?? {}),
        templateName: params.templateName,
        templateLanguage: params.language,
        templateFailureReason: templateResult.failureReason,
        fallbackChannel: "text",
      },
    });

    if (textResult.delivered) {
      return textResult;
    }

    const failureReason = [templateResult.failureReason, textResult.failureReason]
      .filter((value): value is string => Boolean(value))
      .join(" | ");

    return {
      ...textResult,
      failureReason: failureReason || textResult.failureReason,
    };
  }

  private buildPaymentConfirmationMessage(params: {
    locale: Locale;
    userName: string;
    orderNumber: string;
    amountLabel: string;
    packageName: string;
    addonsLabel: string | null;
    dashboardUrl: string | null;
    variant: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer";
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `${this.resolvePaymentIntro("fr", params.variant)}\n` +
        `Commande: ${params.orderNumber}\n` +
        `Pack: ${params.packageName}\n` +
        `Montant: ${params.amountLabel}\n` +
        (params.addonsLabel ? `Options: ${params.addonsLabel}\n` : "") +
        (params.dashboardUrl ? `Tableau de bord: ${params.dashboardUrl}\n` : "")
      ).trim();
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `${this.resolvePaymentIntro("es", params.variant)}\n` +
        `Pedido: ${params.orderNumber}\n` +
        `Paquete: ${params.packageName}\n` +
        `Monto: ${params.amountLabel}\n` +
        (params.addonsLabel ? `Extras: ${params.addonsLabel}\n` : "") +
        (params.dashboardUrl ? `Panel: ${params.dashboardUrl}\n` : "")
      ).trim();
    }

    return (
      `Hi ${params.userName},\n\n` +
      `${this.resolvePaymentIntro("en", params.variant)}\n` +
      `Order: ${params.orderNumber}\n` +
      `Package: ${params.packageName}\n` +
      `Amount: ${params.amountLabel}\n` +
      (params.addonsLabel ? `Add-ons: ${params.addonsLabel}\n` : "") +
      (params.dashboardUrl ? `Dashboard: ${params.dashboardUrl}\n` : "")
    ).trim();
  }

  private buildBankTransferVerificationMessage(params: {
    locale: Locale;
    userName: string;
    orderNumber: string;
    amountLabel: string;
    packageName: string;
    addonsLabel: string;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Nous avons recu votre paiement\n\n` +
        `Merci pour votre virement bancaire. Notre equipe verifie actuellement votre paiement. Cela prend generalement moins de 30 minutes pendant les heures ouvrables.\n\n` +
        `Resume de commande\n` +
        `Pack: ${params.packageName}\n` +
        `Numero de commande: ${params.orderNumber}\n` +
        `Montant transfere: ${params.amountLabel}\n` +
        `Modules: ${params.addonsLabel}\n\n` +
        `Que se passe-t-il ensuite ?\n` +
        `1. Notre equipe verifie votre recu de transfert\n` +
        `2. Une fois verifie, vous recevrez votre lien d'inscription par email\n` +
        `3. Completez la configuration de votre compte et commencez votre aventure editoriale\n\n` +
        `Nous vous remercions de votre patience.`
      );
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `Recibimos tu pago\n\n` +
        `Gracias por tu transferencia bancaria. Nuestro equipo esta verificando tu pago actualmente. Esto normalmente toma menos de 30 minutos durante el horario laboral.\n\n` +
        `Resumen del pedido\n` +
        `Paquete: ${params.packageName}\n` +
        `Numero de pedido: ${params.orderNumber}\n` +
        `Monto transferido: ${params.amountLabel}\n` +
        `Extras: ${params.addonsLabel}\n\n` +
        `Que sigue?\n` +
        `1. Nuestro equipo verifica tu recibo de transferencia\n` +
        `2. Una vez verificado, recibiras tu enlace de registro por correo\n` +
        `3. Completa la configuracion de tu cuenta y comienza tu aventura editorial\n\n` +
        `Agradecemos tu paciencia.`
      );
    }

    return (
      `Hi ${params.userName},\n\n` +
      `We Received Your Payment\n\n` +
      `Thank you for your bank transfer. Our team is currently verifying your payment. This typically takes less than 30 minutes during business hours.\n\n` +
      `Order Summary\n` +
      `Package: ${params.packageName}\n` +
      `Order Number: ${params.orderNumber}\n` +
      `Amount Transferred: ${params.amountLabel}\n` +
      `Add-ons: ${params.addonsLabel}\n\n` +
      `What happens next?\n` +
      `1. Our team verifies your transfer receipt\n` +
      `2. Once verified, you'll receive your account signup link via email\n` +
      `3. Complete your account setup and start your publishing journey\n\n` +
      `We appreciate your patience.`
    );
  }

  private buildRefundConfirmationMessage(params: {
    locale: Locale;
    userName: string;
    orderNumber: string;
    originalAmountLabel: string;
    refundAmountLabel: string;
    refundReason: string;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Votre remboursement a ete traite\n\n` +
        `Nous avons traite un remboursement pour votre commande. Les details sont ci-dessous.\n\n` +
        `Numero de commande: ${params.orderNumber}\n` +
        `Montant original: ${params.originalAmountLabel}\n` +
        `Montant rembourse: ${params.refundAmountLabel}\n` +
        `Raison: ${params.refundReason}\n\n` +
        `Veuillez prevoir 5 a 10 jours ouvrables pour que le remboursement apparaisse sur votre compte.`
      ).trim();
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `Tu reembolso ha sido procesado\n\n` +
        `Hemos procesado un reembolso para tu pedido. Los detalles estan a continuacion.\n\n` +
        `Numero de pedido: ${params.orderNumber}\n` +
        `Monto original: ${params.originalAmountLabel}\n` +
        `Monto reembolsado: ${params.refundAmountLabel}\n` +
        `Razon: ${params.refundReason}\n\n` +
        `Por favor espera de 5 a 10 dias habiles para que el reembolso aparezca en tu cuenta.`
      ).trim();
    }

    return (
      `Hi ${params.userName},\n\n` +
      `Your Refund Has Been Processed\n\n` +
      `We've processed a refund for your order. The details are below.\n\n` +
      `Order Number: ${params.orderNumber}\n` +
      `Original Amount: ${params.originalAmountLabel}\n` +
      `Refund amount: ${params.refundAmountLabel}\n` +
      `Reason: ${params.refundReason}\n\n` +
      `Please allow 5-10 business days for the refund to appear in your account.`
    ).trim();
  }

  private buildBookStatusMessage(params: {
    locale: Locale;
    userName: string;
    bookTitle: string;
    statusLabel: string;
    dashboardUrl: string | null;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Le statut de votre livre a change\n\n` +
        `Votre livre "${params.bookTitle}" a ete mis a jour avec un nouveau statut.\n\n` +
        `Statut actuel\n` +
        `${params.statusLabel}\n` +
        (params.dashboardUrl ? `\nVoir les details du livre: ${params.dashboardUrl}\n` : "")
      ).trim();
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `El estado de tu libro ha cambiado\n\n` +
        `Tu libro "${params.bookTitle}" ha sido actualizado con un nuevo estado.\n\n` +
        `Estado actual\n` +
        `${params.statusLabel}\n` +
        (params.dashboardUrl ? `\nVer detalles del libro: ${params.dashboardUrl}\n` : "")
      ).trim();
    }

    return (
      `Hi ${params.userName},\n\n` +
      `Your Book Status Has Changed\n\n` +
      `Your book "${params.bookTitle}" has been updated to a new status.\n\n` +
      `Current Status\n` +
      `${params.statusLabel}\n` +
      (params.dashboardUrl ? `\nView Book Details: ${params.dashboardUrl}\n` : "")
    ).trim();
  }

  private buildShippingMessage(params: {
    locale: Locale;
    userName: string;
    bookTitle: string;
    orderNumber: string;
    trackingNumber: string;
    shippingProvider: string | null;
    trackingUrl: string | null;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Votre livre "${params.bookTitle}" est en cours d'expedition.\n` +
        `Commande: ${params.orderNumber}\n` +
        `Numero de suivi: ${params.trackingNumber}\n` +
        (params.shippingProvider ? `Transporteur: ${params.shippingProvider}\n` : "") +
        (params.trackingUrl ? `Suivi: ${params.trackingUrl}\n` : "")
      ).trim();
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `Tu libro "${params.bookTitle}" ya esta en envio.\n` +
        `Pedido: ${params.orderNumber}\n` +
        `Numero de seguimiento: ${params.trackingNumber}\n` +
        (params.shippingProvider ? `Transportista: ${params.shippingProvider}\n` : "") +
        (params.trackingUrl ? `Seguimiento: ${params.trackingUrl}\n` : "")
      ).trim();
    }

    return (
      `Hi ${params.userName},\n\n` +
      `Your book "${params.bookTitle}" is now shipping.\n` +
      `Order: ${params.orderNumber}\n` +
      `Tracking number: ${params.trackingNumber}\n` +
      (params.shippingProvider ? `Carrier: ${params.shippingProvider}\n` : "") +
      (params.trackingUrl ? `Tracking: ${params.trackingUrl}\n` : "")
    ).trim();
  }

  private buildManuscriptRejectedMessage(params: {
    locale: Locale;
    userName: string;
    bookTitle: string;
    rejectionReason: string;
    dashboardUrl: string | null;
  }): string {
    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Le manuscrit necessite votre attention\n\n` +
        `Apres examen de votre manuscrit pour "${params.bookTitle}", notre equipe a identifie des points a corriger avant de pouvoir continuer.\n\n` +
        `Commentaires de notre equipe\n` +
        `${params.rejectionReason}\n` +
        (params.dashboardUrl
          ? `\n\nTelecharger le manuscrit revise: ${params.dashboardUrl}\n`
          : "") +
        `\nSi vous avez des questions sur ces commentaires, n'hesitez pas a nous contacter.`
      ).trim();
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `El manuscrito requiere atencion\n\n` +
        `Despues de revisar tu manuscrito para "${params.bookTitle}", nuestro equipo ha identificado algunos puntos que deben corregirse antes de continuar.\n\n` +
        `Comentarios de nuestro equipo\n` +
        `${params.rejectionReason}\n` +
        (params.dashboardUrl ? `\n\nSubir manuscrito revisado: ${params.dashboardUrl}\n` : "") +
        `\nSi tienes preguntas sobre estos comentarios, no dudes en contactarnos.`
      ).trim();
    }

    return (
      `Hi ${params.userName},\n\n` +
      `Manuscript Requires Attention\n\n` +
      `After reviewing your manuscript for "${params.bookTitle}", our team has identified some issues that need to be addressed before we can proceed.\n\n` +
      `Feedback from our team\n` +
      `${params.rejectionReason}\n` +
      (params.dashboardUrl ? `\n\nUpload Revised Manuscript: ${params.dashboardUrl}\n` : "") +
      `\nIf you have questions about this feedback, please don't hesitate to reach out.`
    ).trim();
  }

  private resolvePaymentIntro(
    locale: Locale,
    variant: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer"
  ): string {
    if (locale === "fr") {
      if (variant === "reprint") return "Votre paiement de reimpression a ete confirme.";
      if (variant === "extra_pages")
        return "Votre paiement pour les pages supplementaires a ete confirme.";
      if (variant === "bank_transfer")
        return "Votre paiement par virement bancaire a ete confirme.";
      if (variant === "quote") return "Votre paiement du devis BookPrinta a ete confirme.";
      return "Votre paiement BookPrinta a ete confirme.";
    }

    if (locale === "es") {
      if (variant === "reprint") return "Tu pago de reimpresion fue confirmado.";
      if (variant === "extra_pages") return "Tu pago por paginas adicionales fue confirmado.";
      if (variant === "bank_transfer") return "Tu pago por transferencia bancaria fue confirmado.";
      if (variant === "quote") return "Tu pago de cotizacion de BookPrinta fue confirmado.";
      return "Tu pago de BookPrinta fue confirmado.";
    }

    if (variant === "reprint") return "Your reprint payment has been confirmed.";
    if (variant === "extra_pages") return "Your extra-pages payment has been confirmed.";
    if (variant === "bank_transfer") return "Your bank transfer payment has been confirmed.";
    if (variant === "quote") return "Your BookPrinta quote payment has been confirmed.";
    return "Your BookPrinta payment has been confirmed.";
  }

  private resolveStatusLabel(status: string, locale: Locale): string {
    const normalized = status.trim().toUpperCase();
    const labels: Record<string, Record<Locale, string>> = {
      PAYMENT_RECEIVED: {
        en: "Payment received",
        fr: "Paiement recu",
        es: "Pago recibido",
      },
      AI_PROCESSING: {
        en: "AI processing",
        fr: "Traitement IA",
        es: "Procesamiento IA",
      },
      DESIGNING: {
        en: "Designing",
        fr: "Design en cours",
        es: "Diseno en curso",
      },
      DESIGNED: {
        en: "Designed",
        fr: "Design termine",
        es: "Diseno terminado",
      },
      FORMATTING: {
        en: "Formatting",
        fr: "Mise en page",
        es: "Maquetacion",
      },
      FORMATTED: {
        en: "Formatted",
        fr: "Mise en page terminee",
        es: "Maquetacion terminada",
      },
      FORMATTING_REVIEW: {
        en: "Formatting review",
        fr: "Revue de mise en page",
        es: "Revision de maquetacion",
      },
      REVIEW: {
        en: "Review",
        fr: "Revision",
        es: "Revision",
      },
      APPROVED: {
        en: "Approved",
        fr: "Approuve",
        es: "Aprobado",
      },
      IN_PRODUCTION: {
        en: "In production",
        fr: "En production",
        es: "En produccion",
      },
      PRINTING: {
        en: "Printing",
        fr: "Impression",
        es: "Impresion",
      },
      PRINTED: {
        en: "Printed",
        fr: "Imprime",
        es: "Impreso",
      },
      SHIPPING: {
        en: "Shipping",
        fr: "Expedition",
        es: "En envio",
      },
      DELIVERED: {
        en: "Delivered",
        fr: "Livre",
        es: "Entregado",
      },
      COMPLETED: {
        en: "Completed",
        fr: "Termine",
        es: "Completado",
      },
      CANCELLED: {
        en: "Cancelled",
        fr: "Annule",
        es: "Cancelado",
      },
      REJECTED: {
        en: "Rejected",
        fr: "Rejete",
        es: "Rechazado",
      },
    };

    const localized = labels[normalized]?.[locale];
    if (localized) return localized;

    return normalized
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private resolveLocale(value: string | null | undefined): Locale {
    if (value === "fr" || value === "es") return value;
    return "en";
  }

  private resolveAddonsLabel(
    addons: string[] | null | undefined,
    locale: Locale,
    emptyState: "addons" | "none"
  ): string {
    if (Array.isArray(addons) && addons.length > 0) {
      return addons.join(", ");
    }

    if (locale === "fr") {
      return emptyState === "addons" ? "Aucun service supplementaire" : "Aucun";
    }

    if (locale === "es") {
      return emptyState === "addons" ? "Sin servicios adicionales" : "Ninguno";
    }

    return emptyState === "addons" ? "No extra services" : "None";
  }

  private resolveBankTransferPackageName(
    packageName: string | null | undefined,
    locale: Locale
  ): string {
    const normalized = packageName?.trim();
    if (normalized) return normalized;

    if (locale === "fr") return "Commande BookPrinta";
    if (locale === "es") return "Pedido BookPrinta";
    return "BookPrinta Order";
  }

  private normalizeUserName(value: string): string {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : "BookPrinta customer";
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
}
