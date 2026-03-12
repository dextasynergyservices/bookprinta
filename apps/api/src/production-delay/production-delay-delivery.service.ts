import type { Locale } from "@bookprinta/emails";
import { renderProductionDelayEmail } from "@bookprinta/emails/render";
import type { NotificationTemplateParams } from "@bookprinta/shared";
import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import type { Prisma } from "../generated/prisma/client.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ProductionDelayAffectedUser } from "./production-delay.service.js";
import type { ProductionDelayMonitorRunResult } from "./production-delay-monitor.service.js";

const DEFAULT_FROM_EMAIL = "BookPrinta <info@bookprinta.com>";
const PRODUCTION_DELAY_RESOLVED_TITLE_KEY = "notifications.production_delay_resolved.title";
const PRODUCTION_DELAY_RESOLVED_MESSAGE_KEY = "notifications.production_delay_resolved.message";
const PRODUCTION_DELAY_RESOLVED_FALLBACK_TITLE = "Production update";
const PRODUCTION_DELAY_RESOLVED_FALLBACK_MESSAGE =
  "Production demand has stabilized and printing timelines are returning to normal.";
const DEFAULT_DASHBOARD_PATH = "/dashboard";

const ACTIVE_DELAY_RECIPIENT_SELECT = {
  id: true,
  userId: true,
  delayNotificationCreatedAt: true,
  emailSentAt: true,
} as const;

const RESOLUTION_RECIPIENT_SELECT = {
  id: true,
  userId: true,
  resolutionNotificationCreatedAt: true,
} as const;

type ActiveDelayRecipientRow = Prisma.ProductionDelayEventRecipientGetPayload<{
  select: typeof ACTIVE_DELAY_RECIPIENT_SELECT;
}>;

@Injectable()
export class ProductionDelayDeliveryService {
  private readonly logger = new Logger(ProductionDelayDeliveryService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.fromEmail =
      process.env.ADMIN_FROM_EMAIL ||
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      DEFAULT_FROM_EMAIL;
  }

  async processRunResult(result: ProductionDelayMonitorRunResult): Promise<void> {
    if (result.activeEventId && result.resolution.isDelayActive) {
      await this.syncActiveEventDeliveries({
        eventId: result.activeEventId,
        affectedUsers: result.resolution.affectedUsers,
      });
    }

    if (this.isResolutionAction(result.action) && result.resolution.activeEvent?.id) {
      await this.createResolutionNotifications(result.resolution.activeEvent.id);
    }
  }

  private async syncActiveEventDeliveries(params: {
    eventId: string;
    affectedUsers: ProductionDelayAffectedUser[];
  }): Promise<void> {
    if (params.affectedUsers.length === 0) return;

    const now = new Date();
    const usersById = new Map(params.affectedUsers.map((user) => [user.userId, user]));
    const userIds = Array.from(usersById.keys());

    const recipientRows = await this.prisma.$transaction(async (tx) => {
      await tx.productionDelayEventRecipient.createMany({
        data: userIds.map((userId) => ({
          eventId: params.eventId,
          userId,
          firstAffectedAt: now,
          lastAffectedAt: now,
        })),
        skipDuplicates: true,
      });

      await tx.productionDelayEventRecipient.updateMany({
        where: {
          eventId: params.eventId,
          userId: { in: userIds },
        },
        data: {
          lastAffectedAt: now,
        },
      });

      return tx.productionDelayEventRecipient.findMany({
        where: {
          eventId: params.eventId,
          userId: { in: userIds },
        },
        select: ACTIVE_DELAY_RECIPIENT_SELECT,
      });
    });

    const recipientsNeedingInAppNotification = recipientRows.filter(
      (row) => row.delayNotificationCreatedAt == null
    );

    if (recipientsNeedingInAppNotification.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.notificationsService.createProductionDelayNotifications(
          {
            recipients: recipientsNeedingInAppNotification
              .map((row) => usersById.get(row.userId))
              .filter((user): user is ProductionDelayAffectedUser => Boolean(user))
              .map((user) => this.buildDelayNotificationRecipient(user)),
          },
          tx
        );

        await tx.productionDelayEventRecipient.updateMany({
          where: {
            id: {
              in: recipientsNeedingInAppNotification.map((row) => row.id),
            },
          },
          data: {
            delayNotificationCreatedAt: now,
          },
        });
      });
    }

    await this.sendDelayEmails(
      recipientRows.filter((row) => row.emailSentAt == null),
      usersById
    );
  }

  private async sendDelayEmails(
    recipientRows: ActiveDelayRecipientRow[],
    usersById: Map<string, ProductionDelayAffectedUser>
  ): Promise<void> {
    if (recipientRows.length === 0) return;

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set - production delay emails skipped");
      return;
    }

    if (!this.frontendBaseUrl) {
      this.logger.warn("FRONTEND_URL not set - production delay emails skipped");
      return;
    }

    for (const row of recipientRows) {
      const user = usersById.get(row.userId);
      if (!user) continue;

      try {
        const locale = this.resolveLocale(user.preferredLanguage);
        const rendered = await renderProductionDelayEmail({
          locale,
          userName: this.resolveUserName(user),
          affectedBooks: this.resolveAffectedBookTitles(user),
          dashboardUrl: this.buildDashboardUrl(locale),
        });

        const result = await this.resend.emails.send({
          from: this.resolveFromEmail(),
          to: user.email,
          subject: rendered.subject,
          html: rendered.html,
        });

        if (result.error) {
          this.logger.error(
            `Failed to send production delay email to ${user.email}: ${result.error.name} - ${result.error.message}`
          );
          continue;
        }

        await this.prisma.productionDelayEventRecipient.updateMany({
          where: {
            id: row.id,
            emailSentAt: null,
          },
          data: {
            emailSentAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Production delay email send failed for ${user.email}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private async createResolutionNotifications(eventId: string): Promise<void> {
    const recipientRows = await this.prisma.productionDelayEventRecipient.findMany({
      where: {
        eventId,
        resolutionNotificationCreatedAt: null,
      },
      select: RESOLUTION_RECIPIENT_SELECT,
    });

    if (recipientRows.length === 0) return;

    const timestamp = new Date();
    const notificationParams = recipientRows.map((row) => ({
      recipientId: row.id,
      userId: row.userId,
      params: this.buildResolutionNotificationParams(),
    }));

    await this.prisma.$transaction(async (tx) => {
      for (const recipient of notificationParams) {
        await this.notificationsService.createSystemNotification(
          {
            userId: recipient.userId,
            ...recipient.params,
          },
          tx
        );
      }

      await tx.productionDelayEventRecipient.updateMany({
        where: {
          id: {
            in: notificationParams.map((recipient) => recipient.recipientId),
          },
        },
        data: {
          resolutionNotificationCreatedAt: timestamp,
        },
      });
    });
  }

  private buildDelayNotificationRecipient(user: ProductionDelayAffectedUser) {
    const primaryBook = user.books[0] ?? null;
    return {
      userId: user.userId,
      orderId: primaryBook?.orderId ?? undefined,
      bookId: primaryBook?.bookId ?? undefined,
      actionHref: primaryBook?.orderId
        ? `${DEFAULT_DASHBOARD_PATH}/orders/${primaryBook.orderId}`
        : DEFAULT_DASHBOARD_PATH,
    };
  }

  private buildResolutionNotificationParams(): {
    titleKey: string;
    messageKey: string;
    params?: NotificationTemplateParams;
    fallbackTitle: string;
    fallbackMessage: string;
    action: { kind: "navigate"; href: string };
    presentation: { tone: "default" };
  } {
    return {
      titleKey: PRODUCTION_DELAY_RESOLVED_TITLE_KEY,
      messageKey: PRODUCTION_DELAY_RESOLVED_MESSAGE_KEY,
      fallbackTitle: PRODUCTION_DELAY_RESOLVED_FALLBACK_TITLE,
      fallbackMessage: PRODUCTION_DELAY_RESOLVED_FALLBACK_MESSAGE,
      action: {
        kind: "navigate",
        href: DEFAULT_DASHBOARD_PATH,
      },
      presentation: {
        tone: "default",
      },
    };
  }

  private buildDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}${DEFAULT_DASHBOARD_PATH}`;
  }

  private resolveAffectedBookTitles(user: ProductionDelayAffectedUser): string[] {
    return Array.from(
      new Set(
        user.books
          .map((book) => this.normalizeString(book.title))
          .filter((title): title is string => Boolean(title))
      )
    );
  }

  private resolveUserName(user: ProductionDelayAffectedUser): string {
    const firstName = this.normalizeString(user.firstName);
    if (firstName) return firstName;

    const emailPrefix = user.email.split("@")[0]?.trim();
    if (emailPrefix) return emailPrefix;

    return user.email;
  }

  private resolveLocale(value: string | null | undefined): Locale {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return "en";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("es")) return "es";
    return "en";
  }

  private normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private resolveFromEmail(): string {
    const normalized = this.fromEmail.trim();
    return normalized.length > 0 ? normalized : DEFAULT_FROM_EMAIL;
  }

  private resolveFrontendBaseUrl(): string {
    const raw =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_WEB_URL ||
      "";
    const normalized = raw.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  private isResolutionAction(action: ProductionDelayMonitorRunResult["action"]): boolean {
    return action === "resolved_auto_event" || action === "resolved_manual_event";
  }
}
