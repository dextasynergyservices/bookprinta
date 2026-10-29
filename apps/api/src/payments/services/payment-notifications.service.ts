import type { Locale } from "@bookprinta/emails";
import {
  renderBankTransferAdminEmail,
  renderBankTransferRejectedEmail,
  renderBankTransferUserEmail,
  renderNewBookOrderAdminEmail,
  renderNewBookOrderUserEmail,
} from "@bookprinta/emails/render";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { Resend } from "resend";
import type { Prisma } from "../../generated/prisma/client.js";
import { PaymentProvider, UserRole } from "../../generated/prisma/enums.js";
import { isUserNotificationChannelEnabled } from "../../notifications/notification-preference-policy.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { WhatsappService } from "../../notifications/whatsapp.service.js";
import { WhatsappNotificationsService } from "../../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  DEFAULT_DASHBOARD_PATH,
  resolveAdminEmailRecipients,
  resolveAdminNotificationsFromEmail,
  resolveCustomerFacingFromEmail,
  resolveFrontendBaseUrl,
} from "../payment-config.js";
import {
  asRecord,
  extractDashboardOrderEmailDelivery,
  formatNaira,
  withDashboardOrderEmailDelivery,
} from "../payment-metadata.js";

/** Admin WhatsApp number used when none is configured in system settings. */
const BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK = "+2348103208297";

/**
 * Hard cap on a single post-commit notification (email / WhatsApp).
 *
 * Bounds how long one slow provider can hold a webhook handler that has already
 * committed the order. Well under Paystack's 10s delivery timeout, though note
 * several notifications run in sequence so this alone does not guarantee the
 * whole handler fits that budget.
 */
const POST_COMMIT_NOTIFICATION_TIMEOUT_MS = 5_000;

/**
 * Outbound payment notifications: bank-transfer alerts to the customer and
 * admins (email, WhatsApp, in-app), payment confirmations, and new-order emails.
 *
 * Every send is best-effort. A failed email or WhatsApp message is logged and
 * never fails the payment flow that triggered it.
 */
@Injectable()
export class PaymentNotificationsService {
  private readonly logger = new Logger(PaymentNotificationsService.name);
  /** Public so PaymentsService can forward a test double (see its `resend` setter). */
  resend: Resend | null;
  private readonly frontendBaseUrl = resolveFrontendBaseUrl();
  private readonly customerPaymentsFromEmail = resolveCustomerFacingFromEmail();
  private readonly adminNotificationsFromEmail = resolveAdminNotificationsFromEmail();
  private readonly adminEmailRecipients = resolveAdminEmailRecipients();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly whatsappService: WhatsappService | null,
    @Optional() private readonly whatsappNotificationsService: WhatsappNotificationsService | null
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  }

  async triggerBankTransferNotifications(params: {
    paymentId: string;
    reference: string;
    orderNumber: string;
    packageName: string;
    addons: string[];
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    receiptUrl: string;
    locale: Locale;
  }): Promise<void> {
    await Promise.allSettled([
      this.notificationsService.notifyAdminsBankTransferReceived({
        reference: params.reference,
        orderNumber: params.orderNumber,
        payerName: params.payerName,
        amountLabel: formatNaira(params.amount),
      }),
      this.sendBankTransferAdminWhatsApp(params),
      this.sendBankTransferUserWhatsApp(params),
      this.sendBankTransferUserEmail(params),
      this.sendBankTransferAdminEmail(params),
    ]);
  }

  private async sendBankTransferAdminWhatsApp(params: {
    orderNumber: string;
    packageName: string;
    addons: string[];
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    receiptUrl: string;
  }): Promise<void> {
    const ws = this.whatsappService;
    if (!ws) {
      this.logger.debug("WhatsappService not available — skipping admin WhatsApp notification");
      return;
    }
    const recipients = await this.resolveBankTransferAdminWhatsAppRecipients(ws);
    if (recipients.length === 0) {
      this.logger.warn("No admin phone numbers found for bank transfer WhatsApp notifications");
      return;
    }

    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const amountLabel = formatNaira(params.amount);

    await Promise.allSettled(
      recipients.map(async (to) => {
        const templateResult = await ws.sendTemplate({
          to,
          templateName: "bank_transfer_admin",
          language: "en",
          kind: "bank transfer admin alert",
          bodyPlaceholders: [
            params.payerName,
            params.payerEmail,
            params.payerPhone,
            amountLabel,
            params.orderNumber,
          ],
          callbackData: params.orderNumber,
          meta: {
            orderNumber: params.orderNumber,
            receiptUrl: params.receiptUrl,
            packageName: params.packageName,
            addons: params.addons,
          },
        });

        if (templateResult.delivered || !templateResult.attempted) {
          return templateResult;
        }

        return ws.sendText({
          to,
          kind: "bank transfer admin alert text fallback",
          text:
            `Hi Admin,\n\n` +
            `New Bank Transfer Received\n\n` +
            `A new bank transfer has been submitted and requires your review.\n\n` +
            `Payer Name: ${params.payerName}\n` +
            `Payer Email: ${params.payerEmail}\n` +
            `Payer Phone: ${params.payerPhone}\n` +
            `Amount: ${amountLabel}\n` +
            `Order Number: ${params.orderNumber}\n` +
            `Receipt: ${params.receiptUrl}\n` +
            `Review in Admin Panel: ${adminPanelUrl}\n\n` +
            `Please review within 30 minutes to maintain our SLA.`,
          callbackData: params.orderNumber,
          meta: {
            orderNumber: params.orderNumber,
            receiptUrl: params.receiptUrl,
            packageName: params.packageName,
            addons: params.addons,
            templateName: "bank_transfer_admin",
            templateLanguage: "en",
            templateFailureReason: templateResult.failureReason,
            fallbackChannel: "text",
          },
        });
      })
    );
  }

  private async sendBankTransferUserWhatsApp(params: {
    payerName: string;
    payerPhone: string;
    amount: number;
    orderNumber: string;
    locale: Locale;
    packageName?: string;
    addons?: string[];
  }): Promise<void> {
    const wns = this.whatsappNotificationsService;
    if (!wns) {
      this.logger.debug(
        "WhatsappNotificationsService not available — skipping user WhatsApp notification"
      );
      return;
    }
    await wns.sendBankTransferVerification({
      recipient: {
        userName: params.payerName,
        phoneNumber: params.payerPhone,
        preferredLanguage: params.locale,
      },
      orderNumber: params.orderNumber,
      amountLabel: formatNaira(params.amount),
      expectedWaitTime: "Less than 30 minutes",
      packageName: params.packageName,
      addons: params.addons,
    });
  }

  private async resolveBankTransferAdminWhatsAppRecipients(ws: WhatsappService): Promise<string[]> {
    const configuredRecipients = await this.resolveConfiguredAdminWhatsAppRecipients(ws);
    if (configuredRecipients.length > 0) {
      return configuredRecipients;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { phoneNumber: true },
    });

    const dbRecipients = admins
      .map((admin) => ws.normalizePhone(admin.phoneNumber))
      .filter((phone) => phone.length > 0);

    if (dbRecipients.length > 0) {
      return Array.from(new Set(dbRecipients));
    }

    const fallback = ws.normalizePhone(BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK);
    return fallback ? [fallback] : [];
  }

  private async resolveConfiguredAdminWhatsAppRecipients(ws: WhatsappService): Promise<string[]> {
    const systemSettingModel = (
      this.prisma as PrismaService & {
        systemSetting?: {
          findUnique?: (args: {
            where: { key: string };
            select: { value: true };
          }) => Promise<{ value: string } | null>;
        };
      }
    ).systemSetting;

    const configured = await systemSettingModel?.findUnique?.({
      where: { key: "admin_whatsapp_numbers" },
      select: { value: true },
    });

    return this.parseAdminWhatsAppRecipients(configured?.value ?? null, ws);
  }

  private parseAdminWhatsAppRecipients(
    value: string | null | undefined,
    ws: WhatsappService
  ): string[] {
    const normalized = value?.trim();
    if (!normalized) return [];

    return Array.from(
      new Set(
        normalized
          .split(",")
          .map((entry) => ws.normalizePhone(entry))
          .filter((entry) => entry.length > 0)
      )
    );
  }

  private async sendBankTransferUserEmail(params: {
    payerName: string;
    payerEmail: string;
    amount: number;
    orderNumber: string;
    packageName: string;
    addons: string[];
    locale: Locale;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer user email skipped");
      return;
    }

    const userEmail = await renderBankTransferUserEmail({
      locale: params.locale,
      userName: params.payerName,
      orderNumber: params.orderNumber,
      packageName: params.packageName,
      addons: params.addons,
      amount: formatNaira(params.amount),
    });

    const sendResult = await this.resend.emails.send({
      from: this.customerPaymentsFromEmail,
      to: params.payerEmail,
      subject: userEmail.subject,
      html: userEmail.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer user email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
    }
  }

  private async sendBankTransferAdminEmail(params: {
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    orderNumber: string;
    receiptUrl: string;
    locale: Locale;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer admin email skipped");
      return;
    }

    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const adminEmail = await renderBankTransferAdminEmail({
      locale: params.locale,
      payerName: params.payerName,
      payerEmail: params.payerEmail,
      payerPhone: params.payerPhone,
      amount: formatNaira(params.amount),
      orderNumber: params.orderNumber,
      receiptUrl: params.receiptUrl,
      adminPanelUrl,
    });

    const sendResult = await this.resend.emails.send({
      from: this.adminNotificationsFromEmail,
      to: this.adminEmailRecipients,
      subject: adminEmail.subject,
      html: adminEmail.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer admin email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
    }
  }

  async sendBankTransferRejectedEmail(params: {
    email: string;
    userName: string;
    locale: Locale;
    orderNumber: string;
    paymentReference: string;
    rejectionReason: string;
    emailNotificationsEnabled?: boolean | null;
  }): Promise<boolean> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.emailNotificationsEnabled,
        kind: "bank_transfer_rejected",
      })
    ) {
      return false;
    }

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer rejection email skipped");
      return false;
    }

    const email = await renderBankTransferRejectedEmail({
      locale: params.locale,
      userName: params.userName,
      orderNumber: params.orderNumber,
      paymentReference: params.paymentReference,
      rejectionReason: params.rejectionReason,
    });

    const sendResult = await this.resend.emails.send({
      from: this.customerPaymentsFromEmail,
      to: params.email,
      subject: email.subject,
      html: email.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer rejection email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
      return false;
    }

    return true;
  }

  async sendPaymentConfirmationWhatsApp(params: {
    userName: string;
    phoneNumber?: string | null;
    preferredLanguage?: string | null;
    whatsAppNotificationsEnabled?: boolean;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons?: string[];
    variant?: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer";
    dashboardUrl?: string | null;
  }): Promise<void> {
    if (!this.whatsappNotificationsService) return;
    // CLAUDE.md Section 22: WhatsApp is supplementary and must fail silently —
    // email and in-app notifications still work. The low-level sender guards
    // itself, but asserting the policy here means a future change to that layer
    // cannot start failing committed orders.
    await this.runPostCommitNotification("payment confirmation WhatsApp", async () => {
      await this.whatsappNotificationsService?.sendPaymentConfirmation({
        recipient: {
          userName: params.userName,
          phoneNumber: params.phoneNumber,
          preferredLanguage: params.preferredLanguage,
          whatsAppNotificationsEnabled: params.whatsAppNotificationsEnabled,
        },
        orderNumber: params.orderNumber,
        amountLabel: params.amountPaid,
        packageName: params.packageName,
        addons: params.addons,
        dashboardUrl: params.dashboardUrl,
        variant: params.variant,
      });
    });
  }

  /**
   * Send confirmation emails when an authenticated user places a new book
   * order from the dashboard ("Print a New Book" flow).
   * - User: order confirmation (locale-aware)
   * - Admin: new order alert (English only)
   */
  async sendNewBookOrderEmails(params: {
    paymentId: string;
    baseMetadata?: Record<string, unknown> | null;
    locale: Locale;
    userName: string;
    userEmail: string;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
    provider: PaymentProvider;
    reference: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — new book order emails skipped");
      return;
    }

    const metadata = asRecord(params.baseMetadata);
    const delivery = extractDashboardOrderEmailDelivery(metadata);
    if (delivery.userSentAt && delivery.adminSentAt) {
      return;
    }

    const dashboardUrl = this.buildLocalizedDashboardUrl(params.locale);
    const adminPanelUrl = `${this.frontendBaseUrl}/admin/orders`;
    const attemptedAt = new Date().toISOString();
    let userSentAt = delivery.userSentAt ?? null;
    let adminSentAt = delivery.adminSentAt ?? null;

    // Send user confirmation email
    if (!userSentAt) {
      try {
        const userEmail = await renderNewBookOrderUserEmail({
          locale: params.locale,
          userName: params.userName,
          orderNumber: params.orderNumber,
          packageName: params.packageName,
          totalPrice: params.amountPaid,
          addons: params.addons,
          dashboardUrl,
        });

        const sendResult = await this.resend.emails.send({
          from: this.customerPaymentsFromEmail,
          to: params.userEmail,
          subject: userEmail.subject,
          html: userEmail.html,
        });

        if (sendResult.error) {
          this.logger.error(
            `Failed to send new book order user email: ${sendResult.error.name} — ${sendResult.error.message}`
          );
        } else {
          userSentAt = attemptedAt;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send new book order email to ${params.userEmail}: ${error instanceof Error ? error.message : error}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    // Send admin notification email
    if (!adminSentAt) {
      try {
        const adminEmail = await renderNewBookOrderAdminEmail({
          locale: "en",
          userName: params.userName,
          userEmail: params.userEmail,
          orderNumber: params.orderNumber,
          packageName: params.packageName,
          totalPrice: params.amountPaid,
          addons: params.addons,
          provider: params.provider,
          reference: params.reference,
          adminPanelUrl,
        });

        const adminRecipients =
          this.adminEmailRecipients.length > 0
            ? this.adminEmailRecipients
            : [this.adminNotificationsFromEmail];

        const sendResult = await this.resend.emails.send({
          from: this.adminNotificationsFromEmail,
          to: adminRecipients,
          subject: adminEmail.subject,
          html: adminEmail.html,
        });

        if (sendResult.error) {
          this.logger.error(
            `Failed to send new book order admin notification: ${sendResult.error.name} — ${sendResult.error.message}`
          );
        } else {
          adminSentAt = attemptedAt;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send new book order admin notification for ${params.orderNumber}: ${error instanceof Error ? error.message : error}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    if (!metadata) {
      return;
    }

    try {
      await this.prisma.payment.update({
        where: { id: params.paymentId },
        data: {
          metadata: withDashboardOrderEmailDelivery(metadata, {
            userSentAt,
            adminSentAt,
            lastAttemptAt: attemptedAt,
          }) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist new book order email delivery state for payment ${params.paymentId}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  async sendOnlinePaymentAdminEmail(params: {
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
    payerEmail: string;
    provider: PaymentProvider;
    reference: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — online payment admin email skipped");
      return;
    }

    const addonsLabel = params.addons.length > 0 ? params.addons.join(", ") : "None";
    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const subject = `Online Payment Received - Order #${params.orderNumber}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="margin:0 0 12px;">New Online Payment Received</h2>
        <p style="margin:0 0 12px;">A customer completed an online payment successfully.</p>
        <p style="margin:0;"><strong>Order Number:</strong> ${params.orderNumber}</p>
        <p style="margin:0;"><strong>Package:</strong> ${params.packageName}</p>
        <p style="margin:0;"><strong>Amount Paid:</strong> ${params.amountPaid}</p>
        <p style="margin:0;"><strong>Add-ons:</strong> ${addonsLabel}</p>
        <p style="margin:0;"><strong>Payer Email:</strong> ${params.payerEmail}</p>
        <p style="margin:0;"><strong>Provider:</strong> ${params.provider}</p>
        <p style="margin:0 0 12px;"><strong>Reference:</strong> ${params.reference}</p>
        <p style="margin:0;">
          <a href="${adminPanelUrl}" style="color:#007eff;text-decoration:underline;">Review in Admin Panel</a>
        </p>
      </div>
    `;

    await this.runPostCommitNotification("online payment admin email", async () => {
      const sendResult = await this.resend?.emails.send({
        from: this.adminNotificationsFromEmail,
        to: this.adminEmailRecipients,
        subject,
        html,
      });

      if (sendResult?.error) {
        this.logger.error(
          `Failed to send online payment admin email: ${sendResult.error.name} — ${sendResult.error.message}`
        );
      }
    });
  }

  /**
   * Runs a notification that happens AFTER the order is already committed.
   *
   * Resend reports API-level problems via `sendResult.error`, but a transport
   * failure — DNS, TLS, timeout — makes the call *reject*. Unguarded, that
   * rejection propagates out of the webhook handler, which produces this chain:
   *
   *   order committed -> notification rejects -> webhook returns 5xx ->
   *   Paystack retries -> the idempotency guard reports "already processed" ->
   *   the remaining notifications are never sent.
   *
   * The customer ends up with an order they were never told about. Since the
   * money is taken and the entities exist, abandoning a notification is strictly
   * better than failing the request: admins can re-send, and the signup link in
   * particular is independently tracked and re-sendable.
   *
   * The timeout also bounds how long one slow provider can hold the handler.
   * Note it does NOT by itself guarantee the whole webhook fits Paystack's 10s
   * budget — several notifications run in sequence. That needs finalisation
   * moved off the request path entirely; see the launch checklist.
   */
  private async runPostCommitNotification(label: string, task: () => Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        task(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${POST_COMMIT_NOTIFICATION_TIMEOUT_MS}ms`)),
            POST_COMMIT_NOTIFICATION_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      // Deliberately swallowed — see the method docs. Logged at error level so it
      // is still visible in Sentry/Pino.
      this.logger.error(
        `Post-commit notification "${label}" failed and was not retried inline: ` +
          `${error instanceof Error ? error.message : error}`
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  buildLocalizedDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}${DEFAULT_DASHBOARD_PATH}`;
  }
}
