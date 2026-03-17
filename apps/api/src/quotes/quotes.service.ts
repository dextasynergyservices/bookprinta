import { randomBytes } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import {
  renderQuoteAdminNotificationEmail,
  renderQuotePaymentLinkRevokedEmail,
  renderQuoteProposalEmail,
  renderQuoteReceivedEmail,
} from "@bookprinta/emails/render";
import type {
  AdminArchiveQuoteInput,
  AdminDeleteQuoteInput,
  AdminDeleteQuoteResponse,
  AdminQuoteActionResponse,
  AdminQuoteDetail,
  AdminQuotePatchInput,
  AdminQuotePatchResponse,
  AdminQuoteSortDirection,
  AdminQuoteSortField,
  AdminQuotesListQuery,
  AdminQuotesListResponse,
  AdminRejectQuoteInput,
  AdminRevokeQuotePaymentLinkInput,
  CreateQuoteInput,
  CreateQuoteResponse,
  GenerateQuotePaymentLinkInput,
  GenerateQuotePaymentLinkResponse,
  PayQuoteByTokenInput,
  PayQuoteByTokenResponse,
  PublicQuotePaymentTokenStatus,
  QuoteEstimateInput,
  QuoteEstimatePresentation,
  QuoteEstimateResponse,
  QuotePaymentLinkDeliveryStatus,
  QuotePaymentLinkDisplayStatus,
  QuotePaymentLinkSummary,
  QuoteSpecialRequirement,
  ResolveQuotePaymentTokenResponse,
  RevokeQuotePaymentLinkResponse,
} from "@bookprinta/shared";
import {
  QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
  QUOTE_PAYMENT_LINK_VALIDITY_MS,
} from "@bookprinta/shared";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Resend } from "resend";
import { normalizePhoneNumber } from "../auth/phone-number.util.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PaymentProvider, PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
import { PaymentsService } from "../payments/payments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const DEFAULT_QUOTE_COST_PER_PAGE = 10;
const DEFAULT_QUOTE_COVER_COST = 500;
const QUOTE_COST_PER_PAGE_KEY = "quote_cost_per_page";
const QUOTE_COVER_COST_KEY = "quote_cover_cost";
const ESTIMATE_RANGE_MARGIN = 5000;
const PLATFORM_MARGIN = 1.35;
const WORDS_PER_PAGE = 200;
const PAYMENT_LINK_TOKEN_BYTES = 24;
const PAYABLE_QUOTE_STATUSES = new Set(["PENDING", "REVIEWING", "PAYMENT_LINK_SENT"]);
const QUOTE_ARCHIVED_ACTION = "CUSTOM_QUOTE_ARCHIVED";
const QUOTE_SOFT_DELETED_ACTION = "CUSTOM_QUOTE_SOFT_DELETED";
const EMAIL_ALREADY_IN_USE_MESSAGE =
  "Email is already associated with an existing account. Confirm the customer email before generating a payment link.";
const PHONE_ALREADY_IN_USE_MESSAGE =
  "Phone number is already associated with an existing account. Confirm the customer phone before generating a payment link.";
const EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE =
  "This email and phone number belong to different accounts. Update one field so both resolve to the same customer account.";
const DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE =
  "The email belongs to a deactivated account. Ask the customer for a different email before continuing.";

const ADMIN_QUOTE_LIST_SELECT = {
  id: true,
  fullName: true,
  email: true,
  workingTitle: true,
  bookPrintSize: true,
  quantity: true,
  hasSpecialReqs: true,
  estimatedPriceLow: true,
  estimatedPriceHigh: true,
  status: true,
  paymentLinkToken: true,
  paymentLinkUrl: true,
  paymentLinkExpiresAt: true,
  order: {
    select: {
      id: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomQuoteSelect;

const ADMIN_QUOTE_DETAIL_SELECT = {
  id: true,
  status: true,
  workingTitle: true,
  estimatedWordCount: true,
  bookPrintSize: true,
  quantity: true,
  coverType: true,
  hasSpecialReqs: true,
  specialReqs: true,
  specialReqsOther: true,
  fullName: true,
  email: true,
  phone: true,
  estimatedPriceLow: true,
  estimatedPriceHigh: true,
  adminNotes: true,
  finalPrice: true,
  paymentLinkToken: true,
  paymentLinkUrl: true,
  paymentLinkExpiresAt: true,
  order: {
    select: {
      id: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomQuoteSelect;

const ADMIN_QUOTE_SORTABLE_FIELDS = [
  "createdAt",
  "updatedAt",
  "fullName",
  "email",
  "workingTitle",
  "bookPrintSize",
  "quantity",
  "status",
  "finalPrice",
] as const;

interface QuoteEstimatorSettings {
  costPerPage: number;
  coverCost: number;
}

interface QuoteChannelDeliveryResult {
  attempted: boolean;
  delivered: boolean;
  failureReason: string | null;
}

export interface QuoteSubmissionContext {
  ip: string;
  nextLocale?: string;
  acceptLanguage?: string;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private readonly resend: Resend | null;
  private readonly quoteFromEmail: string | null;
  private readonly quoteAdminRecipients: string[];
  private readonly frontendBaseUrl: string;
  private readonly infobipBaseUrl: string;
  private readonly infobipApiKey: string;
  private readonly infobipWhatsAppFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.quoteFromEmail = this.resolveQuoteFromEmail();
    this.quoteAdminRecipients = this.resolveQuoteAdminRecipients();
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
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

  async resolvePaymentToken(token: string): Promise<ResolveQuotePaymentTokenResponse> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return {
        tokenStatus: "NOT_FOUND",
        quote: null,
        message: "Payment link is invalid.",
      };
    }

    const quote = await this.prisma.customQuote.findUnique({
      where: { paymentLinkToken: normalizedToken },
      select: {
        id: true,
        workingTitle: true,
        fullName: true,
        email: true,
        bookPrintSize: true,
        quantity: true,
        finalPrice: true,
        status: true,
        paymentLinkExpiresAt: true,
      },
    });

    if (!quote) {
      const revoked = await this.isRevokedPaymentToken(normalizedToken);
      return {
        tokenStatus: revoked ? "REVOKED" : "NOT_FOUND",
        quote: null,
        message: revoked
          ? "This payment link has been revoked. Contact BookPrinta support for help."
          : "This payment link does not exist.",
      };
    }

    const finalPrice = Number(quote.finalPrice ?? 0);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      return {
        tokenStatus: "NOT_FOUND",
        quote: null,
        message: "This quote is not ready for payment yet.",
      };
    }

    const tokenStatus: PublicQuotePaymentTokenStatus =
      quote.status === "PAID" || quote.status === "COMPLETED"
        ? "PAID"
        : quote.status !== "PAYMENT_LINK_SENT"
          ? "REVOKED"
          : quote.paymentLinkExpiresAt && quote.paymentLinkExpiresAt.getTime() <= Date.now()
            ? "EXPIRED"
            : "VALID";

    return {
      tokenStatus,
      quote: {
        id: quote.id,
        workingTitle: quote.workingTitle,
        fullName: quote.fullName,
        email: quote.email,
        bookPrintSize: this.toBookSize(quote.bookPrintSize),
        quantity: quote.quantity,
        finalPrice: Math.round(finalPrice),
        status: this.toQuoteStatus(quote.status),
        paymentLinkExpiresAt: quote.paymentLinkExpiresAt?.toISOString() ?? null,
      },
      message:
        tokenStatus === "VALID"
          ? null
          : tokenStatus === "EXPIRED"
            ? "This payment link has expired. Contact BookPrinta support for a new link."
            : tokenStatus === "PAID"
              ? "This quote has already been paid."
              : tokenStatus === "REVOKED"
                ? "This payment link has been revoked. Contact BookPrinta support for help."
                : "This payment link is invalid.",
    };
  }

  async payByToken(token: string, input: PayQuoteByTokenInput): Promise<PayQuoteByTokenResponse> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new NotFoundException("Payment link is invalid.");
    }

    const quote = await this.prisma.customQuote.findUnique({
      where: { paymentLinkToken: normalizedToken },
      select: {
        id: true,
        workingTitle: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        bookPrintSize: true,
        quantity: true,
        finalPrice: true,
        paymentLinkExpiresAt: true,
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException("Payment link not found.");
    }

    if (quote.status === "PAID" || quote.status === "COMPLETED") {
      if (!quote.order?.id) {
        throw new ConflictException("Quote is already paid but no linked order was found.");
      }

      return {
        quoteId: quote.id,
        orderId: quote.order.id,
        status: "PAID",
        redirectTo: `${this.frontendBaseUrl || ""}/dashboard/orders/${quote.order.id}`,
        skipFormatting: true,
      };
    }

    if (quote.status !== "PAYMENT_LINK_SENT") {
      throw new BadRequestException("This payment link is no longer active.");
    }

    if (!quote.paymentLinkExpiresAt || quote.paymentLinkExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("This payment link has expired.");
    }

    const finalPrice = Number(quote.finalPrice ?? 0);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      throw new BadRequestException("Quote final price is not configured.");
    }

    if (input.provider === "BANK_TRANSFER") {
      const bankTransferResult = await this.prisma.$transaction(async (tx) => {
        const existingPayment = await tx.payment.findFirst({
          where: {
            provider: PaymentProvider.BANK_TRANSFER,
            type: PaymentType.CUSTOM_QUOTE,
            status: {
              in: [PaymentStatus.AWAITING_APPROVAL, PaymentStatus.SUCCESS],
            },
            OR: [
              ...(quote.order?.id ? [{ orderId: quote.order.id }] : []),
              {
                metadata: {
                  path: ["customQuoteId"],
                  equals: quote.id,
                },
              },
            ],
          },
          select: {
            id: true,
            status: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (existingPayment?.status === PaymentStatus.SUCCESS) {
          return {
            orderId: quote.order?.id ?? null,
            status: "PAID" as const,
          };
        }

        if (existingPayment) {
          return {
            orderId: quote.order?.id ?? null,
            status: "PENDING_PAYMENT_APPROVAL" as const,
          };
        }

        const reference = this.generatePaymentReference("btq");

        await tx.payment.create({
          data: {
            provider: PaymentProvider.BANK_TRANSFER,
            type: PaymentType.CUSTOM_QUOTE,
            amount: finalPrice,
            currency: "NGN",
            status: PaymentStatus.AWAITING_APPROVAL,
            providerRef: reference,
            payerName: quote.fullName,
            payerEmail: quote.email,
            payerPhone: quote.phone,
            metadata: {
              paymentFlow: "CUSTOM_QUOTE",
              customQuoteId: quote.id,
              quoteTitle: quote.workingTitle,
              quoteQuantity: quote.quantity,
              quotePrintSize: this.toBookSize(quote.bookPrintSize),
              quoteFinalPrice: finalPrice,
              fullName: quote.fullName,
              phone: quote.phone,
              email: quote.email,
            },
          } as Prisma.PaymentUncheckedCreateInput,
        });

        return {
          orderId: quote.order?.id ?? null,
          status: "PENDING_PAYMENT_APPROVAL" as const,
        };
      });

      if (bankTransferResult.status === "PAID") {
        if (!bankTransferResult.orderId) {
          throw new ConflictException(
            "Quote payment succeeded but no linked order was found. Please contact support."
          );
        }

        return {
          quoteId: quote.id,
          orderId: bankTransferResult.orderId,
          status: "PAID",
          redirectTo: `${this.frontendBaseUrl || ""}/dashboard/orders/${bankTransferResult.orderId}`,
          skipFormatting: true,
        };
      }

      return {
        quoteId: quote.id,
        orderId: bankTransferResult.orderId,
        status: "PENDING_PAYMENT_APPROVAL",
        redirectTo: `${this.frontendBaseUrl || ""}/pay/${normalizedToken}?status=awaiting-approval`,
        skipFormatting: true,
      };
    }

    let initialized: Awaited<ReturnType<PaymentsService["initialize"]>>;
    try {
      initialized = await this.paymentsService.initialize({
        provider: input.provider,
        email: quote.email,
        amount: finalPrice,
        currency: "NGN",
        callbackUrl: this.frontendBaseUrl
          ? `${this.frontendBaseUrl}/pay/${normalizedToken}`
          : undefined,
        metadata: {
          paymentFlow: "CUSTOM_QUOTE",
          customQuoteId: quote.id,
          quoteTitle: quote.workingTitle,
          quoteQuantity: quote.quantity,
          quotePrintSize: this.toBookSize(quote.bookPrintSize),
          quoteFinalPrice: finalPrice,
          fullName: quote.fullName,
          phone: quote.phone,
          email: quote.email,
          packageName: "Custom Quote",
        },
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const reason = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Quote payment initialization failed for quote ${quote.id} (${input.provider}): ${reason}`
      );

      throw new BadGatewayException(
        `${input.provider} payment could not be initialized right now. Please try again or use bank transfer.`
      );
    }

    return {
      quoteId: quote.id,
      orderId: quote.order?.id ?? null,
      status: "PENDING_PAYMENT",
      redirectTo: initialized.authorizationUrl,
      skipFormatting: true,
    };
  }

  /**
   * Price estimator endpoint (Path B).
   *
   * Formula from CLAUDE.md Section 8:
   * NP = Math.ceil(estimatedWordCount / 200)
   * A5 Total = ((NP + 10) * CPP + C) * Q * 1.35
   * A4 Total = A5 Total * 2
   * A6 Total = A5 Total / 2
   * Low  = Math.round(Total - 5000)
   * High = Math.round(Total + 5000)
   */
  async estimate(input: QuoteEstimateInput): Promise<QuoteEstimateResponse> {
    const settings = await this.getEstimatorSettings();

    const estimatedPages = Math.ceil(input.estimatedWordCount / WORDS_PER_PAGE);
    const a5Total =
      ((estimatedPages + 10) * settings.costPerPage + settings.coverCost) *
      input.quantity *
      PLATFORM_MARGIN;

    const total = this.applyBookSizeMultiplier(a5Total, input.bookSize);
    const estimatedPriceLow = Math.max(0, Math.round(total - ESTIMATE_RANGE_MARGIN));
    const estimatedPriceHigh = Math.max(0, Math.round(total + ESTIMATE_RANGE_MARGIN));

    return {
      estimatedPriceLow,
      estimatedPriceHigh,
    };
  }

  /**
   * Quote submission endpoint (Path B).
   */
  async create(
    input: CreateQuoteInput,
    context: QuoteSubmissionContext
  ): Promise<CreateQuoteResponse> {
    const locale = this.resolveLocale(context.nextLocale, context.acceptLanguage);
    const isHuman = await this.verifyRecaptcha(input.recaptchaToken);
    if (!isHuman) {
      throw new BadRequestException("reCAPTCHA verification failed. Please try again.");
    }

    const specialRequirements = this.normalizeSpecialRequirements(
      input.specialRequirements,
      input.hasSpecialReqs
    );
    const hasOtherSpecialRequirement = specialRequirements.includes("other");
    const normalizedWorkingTitle = input.workingTitle.trim();
    const normalizedFullName = input.fullName.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedPhone = input.phone.trim();
    const normalizedSpecialRequirementsOther = hasOtherSpecialRequirement
      ? this.normalizeText(input.specialRequirementsOther)
      : null;
    const calculatedEstimate = input.hasSpecialReqs
      ? null
      : await this.estimate({
          estimatedWordCount: input.estimatedWordCount,
          bookSize: input.bookSize,
          quantity: input.quantity,
        });
    const estimatedPriceLow = input.hasSpecialReqs
      ? null
      : (calculatedEstimate?.estimatedPriceLow ?? null);
    const estimatedPriceHigh = input.hasSpecialReqs
      ? null
      : (calculatedEstimate?.estimatedPriceHigh ?? null);

    const createdQuote = await this.prisma.customQuote.create({
      data: {
        workingTitle: normalizedWorkingTitle,
        estimatedWordCount: input.estimatedWordCount,
        bookPrintSize: input.bookSize,
        quantity: input.quantity,
        coverType: input.coverType,
        hasSpecialReqs: input.hasSpecialReqs,
        specialReqs: specialRequirements,
        specialReqsOther: normalizedSpecialRequirementsOther,
        fullName: normalizedFullName,
        email: normalizedEmail,
        phone: normalizedPhone,
        estimatedPriceLow,
        estimatedPriceHigh,
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
      },
    });

    this.logger.log(
      `Custom quote submitted: ${createdQuote.id} (locale=${locale}, ip=${context.ip || "unknown"})`
    );

    await this.sendQuoteEmails({
      quoteId: createdQuote.id,
      locale,
      workingTitle: normalizedWorkingTitle,
      estimatedWordCount: input.estimatedWordCount,
      bookSize: input.bookSize,
      quantity: input.quantity,
      coverType: input.coverType,
      hasSpecialReqs: input.hasSpecialReqs,
      specialRequirements,
      specialRequirementsOther: normalizedSpecialRequirementsOther,
      fullName: normalizedFullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      estimatedPriceLow,
      estimatedPriceHigh,
    });

    return {
      id: createdQuote.id,
      status: createdQuote.status,
      message: "Custom quote submitted successfully.",
    };
  }

  async findAdminQuotes(query: AdminQuotesListQuery): Promise<AdminQuotesListResponse> {
    const softDeletedQuoteIds = await this.getSoftDeletedQuoteIds();
    const where = this.buildAdminQuotesWhere(query, softDeletedQuoteIds);
    const orderBy = this.buildAdminQuotesOrderBy(query.sortBy, query.sortDirection);

    const rows = await this.prisma.customQuote.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: ADMIN_QUOTE_LIST_SELECT,
    });

    const totalItems = await this.prisma.customQuote.count({ where });
    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => this.serializeAdminQuoteListItem(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems,
      limit: query.limit,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      sortableFields: [...ADMIN_QUOTE_SORTABLE_FIELDS],
    };
  }

  async findAdminQuoteById(quoteId: string): Promise<AdminQuoteDetail> {
    await this.assertQuoteNotSoftDeleted(quoteId);

    const row = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: ADMIN_QUOTE_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    const specialReqs = this.parseSpecialRequirements(row.specialReqs);
    const actionAvailability = this.resolveQuoteActionAvailability({
      status: row.status,
      hasOrder: Boolean(row.order?.id),
      isArchived: false,
      isDeleted: false,
      paymentLinkToken: row.paymentLinkToken,
      paymentLinkExpiresAt: row.paymentLinkExpiresAt,
    });

    return {
      id: row.id,
      status: row.status,
      manuscript: {
        workingTitle: row.workingTitle,
        estimatedWordCount: row.estimatedWordCount,
      },
      print: {
        bookPrintSize: this.toBookSize(row.bookPrintSize),
        quantity: row.quantity,
        coverType: this.toCoverType(row.coverType),
      },
      specialRequirements: {
        hasSpecialReqs: row.hasSpecialReqs,
        specialReqs,
        specialReqsOther: row.specialReqsOther,
      },
      contact: {
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
      },
      estimate: this.buildEstimatePresentation(
        row.hasSpecialReqs,
        this.toNumber(row.estimatedPriceLow),
        this.toNumber(row.estimatedPriceHigh)
      ),
      adminNotes: row.adminNotes,
      finalPrice: this.toNumber(row.finalPrice),
      actions: actionAvailability,
      paymentLink: this.buildPaymentLinkSummary({
        status: row.status,
        paymentLinkToken: row.paymentLinkToken,
        paymentLinkUrl: row.paymentLinkUrl,
        paymentLinkExpiresAt: row.paymentLinkExpiresAt,
        updatedAt: row.updatedAt,
      }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateAdminQuote(
    quoteId: string,
    input: AdminQuotePatchInput,
    adminId: string
  ): Promise<AdminQuotePatchResponse> {
    const normalizedEmail = input.email?.trim().toLowerCase();
    const normalizedPhone = input.phone?.trim();

    if (normalizedEmail || normalizedPhone) {
      await this.assertAdminQuoteContactConflict({
        quoteId,
        email: normalizedEmail,
        phone: normalizedPhone,
      });
    }

    const updated = await this.prisma.customQuote.update({
      where: { id: quoteId },
      data: {
        ...(input.adminNotes !== undefined
          ? {
              adminNotes: this.normalizeText(input.adminNotes),
            }
          : {}),
        ...(input.finalPrice !== undefined
          ? {
              finalPrice: input.finalPrice,
            }
          : {}),
        ...(normalizedEmail !== undefined
          ? {
              email: normalizedEmail,
            }
          : {}),
        ...(normalizedPhone !== undefined
          ? {
              phone: normalizedPhone,
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        adminNotes: true,
        finalPrice: true,
        email: true,
        phone: true,
        updatedAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "CUSTOM_QUOTE_UPDATED",
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          updatedFields: {
            adminNotes: input.adminNotes !== undefined,
            finalPrice: input.finalPrice !== undefined,
            email: normalizedEmail !== undefined,
            phone: normalizedPhone !== undefined,
          },
        },
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      adminNotes: updated.adminNotes,
      finalPrice: this.toNumber(updated.finalPrice),
      contact: {
        email: updated.email,
        phone: updated.phone,
      },
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async generatePaymentLink(
    quoteId: string,
    input: GenerateQuotePaymentLinkInput,
    adminId: string
  ): Promise<GenerateQuotePaymentLinkResponse> {
    const existing = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        status: true,
        finalPrice: true,
        paymentLinkToken: true,
        paymentLinkExpiresAt: true,
        fullName: true,
        email: true,
        phone: true,
        adminNotes: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    this.assertQuoteCanGeneratePaymentLink(existing);

    if (!Number.isFinite(input.finalPrice) || input.finalPrice <= 0) {
      throw new BadRequestException(
        "A valid finalPrice is required before generating a payment link."
      );
    }

    if (
      existing.status === "PAYMENT_LINK_SENT" &&
      this.hasActivePaymentLink(existing.paymentLinkToken, existing.paymentLinkExpiresAt)
    ) {
      throw new BadRequestException(
        "This quote already has an active payment link. Revoke the existing link before generating a new one."
      );
    }

    if (!this.frontendBaseUrl) {
      throw new BadRequestException(
        "FRONTEND_URL (or NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_WEB_URL) must be configured to generate payment links."
      );
    }

    const token = await this.generateUniquePaymentLinkToken();
    const expiresAt = new Date(Date.now() + QUOTE_PAYMENT_LINK_VALIDITY_MS);
    const paymentLinkUrl = this.buildPublicPaymentLinkUrl(token);

    const updated = await this.prisma.customQuote.update({
      where: { id: quoteId },
      data: {
        finalPrice: input.finalPrice,
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: token,
        paymentLinkUrl,
        paymentLinkExpiresAt: expiresAt,
      },
      select: {
        id: true,
        status: true,
        paymentLinkToken: true,
        paymentLinkUrl: true,
        paymentLinkExpiresAt: true,
        updatedAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "CUSTOM_QUOTE_PAYMENT_LINK_GENERATED",
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          finalPrice: input.finalPrice,
          expiresAt: expiresAt.toISOString(),
          validityDays: QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
        },
      },
    });

    const delivery = await this.sendQuoteProposalNotifications({
      locale: this.resolveQuoteLocale(),
      userName: existing.fullName,
      email: existing.email,
      phone: existing.phone,
      paymentUrl: paymentLinkUrl,
      finalPrice: input.finalPrice,
      adminNotes: existing.adminNotes,
      proposalPdfUrl: undefined,
      quoteId,
    });

    return {
      id: updated.id,
      status: "PAYMENT_LINK_SENT",
      paymentLink: this.buildPaymentLinkSummary({
        status: updated.status,
        paymentLinkToken: updated.paymentLinkToken,
        paymentLinkUrl: updated.paymentLinkUrl,
        paymentLinkExpiresAt: updated.paymentLinkExpiresAt,
        updatedAt: updated.updatedAt,
      }),
      delivery,
    };
  }

  private resolveQuoteLocale(): Locale {
    return "en";
  }

  private async sendQuoteProposalNotifications(params: {
    locale: Locale;
    userName: string;
    email: string;
    phone: string;
    paymentUrl: string;
    finalPrice: number;
    adminNotes: string | null;
    proposalPdfUrl?: string;
    quoteId: string;
  }): Promise<QuotePaymentLinkDeliveryStatus> {
    const attemptedAt = new Date().toISOString();

    const [emailResult, whatsappResult] = await Promise.all([
      this.sendQuoteProposalEmail(params),
      this.sendQuoteProposalWhatsApp(params),
    ]);

    return {
      attemptedAt,
      email: emailResult,
      whatsapp: whatsappResult,
    };
  }

  private async sendQuoteProposalEmail(params: {
    locale: Locale;
    userName: string;
    email: string;
    paymentUrl: string;
    finalPrice: number;
    adminNotes: string | null;
    proposalPdfUrl?: string;
    quoteId: string;
  }): Promise<QuoteChannelDeliveryResult> {
    if (!this.resend) {
      this.logger.warn(
        `Quote proposal email skipped: RESEND_API_KEY not set (quoteId=${params.quoteId})`
      );
      return {
        attempted: false,
        delivered: false,
        failureReason: "RESEND_API_KEY not set",
      };
    }

    if (!this.quoteFromEmail) {
      this.logger.warn(
        `Quote proposal email skipped: sender email not configured (quoteId=${params.quoteId})`
      );
      return {
        attempted: false,
        delivered: false,
        failureReason: "Quote sender email not configured",
      };
    }

    try {
      const rendered = await renderQuoteProposalEmail({
        locale: params.locale,
        userName: params.userName,
        totalPrice: this.formatNaira(params.finalPrice),
        paymentUrl: params.paymentUrl,
        proposalPdfUrl: params.proposalPdfUrl,
        adminNotes: params.adminNotes ?? undefined,
      });

      const result = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: params.email,
        subject: rendered.subject,
        html: rendered.html,
      });

      if (result.error) {
        const failureReason = `${result.error.name}: ${result.error.message}`;
        this.logger.error(
          `Quote proposal email delivery failed: ${JSON.stringify({ quoteId: params.quoteId, email: params.email, failureReason })}`
        );
        Sentry.captureException(
          new Error(`Quote proposal email delivery failed: ${failureReason}`)
        );
        return {
          attempted: true,
          delivered: false,
          failureReason,
        };
      }

      return {
        attempted: true,
        delivered: true,
        failureReason: null,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Quote proposal email delivery failed: ${JSON.stringify({ quoteId: params.quoteId, email: params.email, failureReason })}`
      );
      Sentry.captureException(error);
      return {
        attempted: true,
        delivered: false,
        failureReason,
      };
    }
  }

  private async sendQuoteProposalWhatsApp(params: {
    locale: Locale;
    userName: string;
    phone: string;
    paymentUrl: string;
    finalPrice: number;
    quoteId: string;
  }): Promise<QuoteChannelDeliveryResult> {
    if (!params.phone?.trim()) {
      return {
        attempted: false,
        delivered: false,
        failureReason: "Phone number not provided",
      };
    }

    if (!this.infobipBaseUrl || !this.infobipApiKey || !this.infobipWhatsAppFrom) {
      this.logMissingInfobipConfig("quote proposal");
      return {
        attempted: false,
        delivered: false,
        failureReason: "Infobip WhatsApp config missing",
      };
    }

    const to = this.normalizeWhatsAppPhone(params.phone);
    if (!to) {
      return {
        attempted: false,
        delivered: false,
        failureReason: "Invalid phone number",
      };
    }

    const text = this.buildQuoteProposalWhatsAppMessage({
      locale: params.locale,
      userName: params.userName,
      finalPrice: params.finalPrice,
      paymentUrl: params.paymentUrl,
    });

    const delivered = await this.sendInfobipTextMessage(to, text, "quote proposal", params.quoteId);

    return {
      attempted: true,
      delivered,
      failureReason: delivered ? null : "Infobip WhatsApp delivery failed",
    };
  }

  private buildQuoteProposalWhatsAppMessage(params: {
    locale: Locale;
    userName: string;
    finalPrice: number;
    paymentUrl: string;
  }): string {
    const price = this.formatNaira(params.finalPrice);

    if (params.locale === "fr") {
      return (
        `Bonjour ${params.userName},\n\n` +
        `Votre devis BookPrinta est pret.\n` +
        `Montant final: ${price}\n` +
        `Lien de paiement: ${params.paymentUrl}\n\n` +
        `Ce lien expire dans ${QUOTE_PAYMENT_LINK_VALIDITY_DAYS} jours.`
      );
    }

    if (params.locale === "es") {
      return (
        `Hola ${params.userName},\n\n` +
        `Tu cotizacion de BookPrinta esta lista.\n` +
        `Monto final: ${price}\n` +
        `Enlace de pago: ${params.paymentUrl}\n\n` +
        `Este enlace expira en ${QUOTE_PAYMENT_LINK_VALIDITY_DAYS} dias.`
      );
    }

    return (
      `Hi ${params.userName},\n\n` +
      `Your BookPrinta custom quote is ready.\n` +
      `Final amount: ${price}\n` +
      `Payment link: ${params.paymentUrl}\n\n` +
      `This link expires in ${QUOTE_PAYMENT_LINK_VALIDITY_DAYS} days.`
    );
  }

  private async sendInfobipTextMessage(
    to: string,
    text: string,
    kind: string,
    quoteId: string
  ): Promise<boolean> {
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
        const error = new Error(
          `Infobip ${kind} WhatsApp failed (${response.status}) for quoteId=${quoteId}: ${body}`
        );
        this.logger.error(error.message);
        Sentry.captureException(error);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Infobip ${kind} WhatsApp failed: ${JSON.stringify({ quoteId, error: error instanceof Error ? error.message : String(error) })}`
      );
      Sentry.captureException(error);
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

  private logMissingInfobipConfig(kind: string): void {
    const missing: string[] = [];
    if (!this.infobipBaseUrl) missing.push("INFOBIP_BASE_URL");
    if (!this.infobipApiKey) missing.push("INFOBIP_API_KEY");
    if (!this.infobipWhatsAppFrom) missing.push("INFOBIP_WHATSAPP_FROM");
    const details = missing.length > 0 ? ` (${missing.join(", ")})` : "";
    this.logger.warn(`Infobip WhatsApp config missing${details} — ${kind} WhatsApp skipped`);
  }

  async revokePaymentLink(
    quoteId: string,
    input: AdminRevokeQuotePaymentLinkInput,
    adminId: string
  ): Promise<RevokeQuotePaymentLinkResponse> {
    const reason = input.reason.trim();
    const customerMessage = this.normalizeText(input.customerMessage);
    const existing = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        status: true,
        paymentLinkToken: true,
        fullName: true,
        email: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    if (existing.status === "PAID" || existing.status === "COMPLETED") {
      throw new BadRequestException("Payment link cannot be revoked after payment is completed.");
    }

    if (!existing.paymentLinkToken) {
      throw new BadRequestException("No active payment link was found for this quote.");
    }

    const updated = await this.prisma.customQuote.update({
      where: { id: quoteId },
      data: {
        status: "REVIEWING",
        paymentLinkToken: null,
        paymentLinkUrl: null,
        paymentLinkExpiresAt: null,
      },
      select: {
        id: true,
        status: true,
        paymentLinkToken: true,
        paymentLinkUrl: true,
        paymentLinkExpiresAt: true,
        updatedAt: true,
      },
    });

    const emailDelivery = input.notifyCustomer
      ? await this.sendQuotePaymentLinkRevokedEmail({
          locale: this.resolveQuoteLocale(),
          userName: existing.fullName,
          email: existing.email,
          reason,
          customerMessage,
          quoteId,
        })
      : {
          attempted: false,
          delivered: false,
          failureReason: null,
        };

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "CUSTOM_QUOTE_PAYMENT_LINK_REVOKED",
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          revokedToken: existing.paymentLinkToken,
          reason,
          notifyCustomer: input.notifyCustomer,
          customerMessage,
          emailDelivery: {
            attempted: emailDelivery.attempted,
            delivered: emailDelivery.delivered,
            failureReason: emailDelivery.failureReason,
          },
        },
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      paymentLink: this.buildPaymentLinkSummary({
        status: updated.status,
        paymentLinkToken: updated.paymentLinkToken,
        paymentLinkUrl: updated.paymentLinkUrl,
        paymentLinkExpiresAt: updated.paymentLinkExpiresAt,
        updatedAt: updated.updatedAt,
      }),
      delivery: {
        email: emailDelivery,
      },
      revoked: true,
    };
  }

  private async assertAdminQuoteContactConflict(params: {
    quoteId: string;
    email?: string;
    phone?: string;
  }): Promise<void> {
    const quote = await this.prisma.customQuote.findUnique({
      where: { id: params.quoteId },
      select: {
        id: true,
      },
    });

    if (!quote) {
      throw new NotFoundException(`Custom quote "${params.quoteId}" not found`);
    }

    const normalizedEmail = params.email?.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(params.phone ?? null);

    if (!normalizedEmail && !normalizedPhone) {
      return;
    }

    const emailUser = normalizedEmail
      ? await this.prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            isActive: true,
          },
        })
      : null;

    if (emailUser && !emailUser.isActive) {
      throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
    }

    const phoneUsers = normalizedPhone
      ? await this.prisma.user.findMany({
          where: {
            phoneNumberNormalized: normalizedPhone,
          },
          select: {
            id: true,
          },
          take: 3,
        })
      : [];

    if (normalizedEmail && !emailUser && !normalizedPhone) {
      return;
    }

    if (!normalizedEmail && phoneUsers.length > 0) {
      throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
    }

    if (normalizedEmail && emailUser && !normalizedPhone) {
      throw new ConflictException(EMAIL_ALREADY_IN_USE_MESSAGE);
    }

    if (!normalizedPhone || phoneUsers.length === 0) {
      return;
    }

    if (!emailUser) {
      throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
    }

    if (phoneUsers.every((user) => user.id === emailUser.id)) {
      return;
    }

    throw new ConflictException(EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE);
  }

  private async sendQuotePaymentLinkRevokedEmail(params: {
    locale: Locale;
    userName: string;
    email: string;
    reason: string;
    customerMessage: string | null;
    quoteId: string;
  }): Promise<QuoteChannelDeliveryResult> {
    if (!this.resend) {
      this.logger.warn(
        `Quote revoke email skipped: RESEND_API_KEY not set (quoteId=${params.quoteId})`
      );
      return {
        attempted: false,
        delivered: false,
        failureReason: "RESEND_API_KEY not set",
      };
    }

    if (!this.quoteFromEmail) {
      this.logger.warn(
        `Quote revoke email skipped: sender email not configured (quoteId=${params.quoteId})`
      );
      return {
        attempted: false,
        delivered: false,
        failureReason: "Quote sender email not configured",
      };
    }

    try {
      const rendered = await renderQuotePaymentLinkRevokedEmail({
        locale: params.locale,
        userName: params.userName,
        reason: params.reason,
        customerMessage: params.customerMessage ?? undefined,
      });

      const result = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: params.email,
        subject: rendered.subject,
        html: rendered.html,
      });

      if (result.error) {
        const failureReason = `${result.error.name}: ${result.error.message}`;
        this.logger.error(
          `Quote revoke email delivery failed: ${JSON.stringify({ quoteId: params.quoteId, email: params.email, failureReason })}`
        );
        Sentry.captureException(new Error(`Quote revoke email delivery failed: ${failureReason}`));
        return {
          attempted: true,
          delivered: false,
          failureReason,
        };
      }

      return {
        attempted: true,
        delivered: true,
        failureReason: null,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Quote revoke email delivery failed: ${JSON.stringify({ quoteId: params.quoteId, email: params.email, failureReason })}`
      );
      Sentry.captureException(error);
      return {
        attempted: true,
        delivered: false,
        failureReason,
      };
    }
  }

  async rejectQuote(
    quoteId: string,
    input: AdminRejectQuoteInput,
    adminId: string
  ): Promise<AdminQuoteActionResponse> {
    await this.assertQuoteNotSoftDeleted(quoteId);

    const current = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        status: true,
        adminNotes: true,
        updatedAt: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    if (current.status === "PAID" || current.status === "COMPLETED") {
      throw new BadRequestException("Paid/completed quotes cannot be rejected.");
    }

    const reason = input.reason.trim();
    const reasonNote = `[REJECTED] ${new Date().toISOString()} - ${reason}`;
    const nextAdminNotes = current.adminNotes
      ? `${current.adminNotes.trim()}\n\n${reasonNote}`
      : reasonNote;

    const updated = await this.prisma.customQuote.update({
      where: { id: quoteId },
      data: {
        status: "REJECTED",
        adminNotes: nextAdminNotes,
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "CUSTOM_QUOTE_REJECTED",
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          reason,
          previousStatus: current.status,
          nextStatus: "REJECTED",
        },
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async archiveQuote(
    quoteId: string,
    input: AdminArchiveQuoteInput,
    adminId: string
  ): Promise<AdminQuoteActionResponse> {
    await this.assertQuoteNotSoftDeleted(quoteId);

    const current = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    const existingArchive = await this.prisma.auditLog.findFirst({
      where: {
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        action: QUOTE_ARCHIVED_ACTION,
      },
      select: {
        id: true,
      },
    });

    if (existingArchive) {
      throw new BadRequestException("Quote is already archived.");
    }

    const archivedAt = new Date().toISOString();
    const reason = input.reason.trim();

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: QUOTE_ARCHIVED_ACTION,
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          reason,
          previousStatus: current.status,
          archivedAt,
        },
      },
    });

    return {
      id: current.id,
      status: current.status,
      updatedAt: current.updatedAt.toISOString(),
    };
  }

  async deleteQuote(
    quoteId: string,
    input: AdminDeleteQuoteInput,
    adminId: string
  ): Promise<AdminDeleteQuoteResponse> {
    if (input.confirmText !== "DELETE") {
      throw new BadRequestException("Deletion confirmation text must be DELETE.");
    }

    await this.assertQuoteNotSoftDeleted(quoteId);

    const current = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        status: true,
        paymentLinkToken: true,
        order: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }

    const isNonPaidQuote = current.status !== "PAID" && current.status !== "COMPLETED";
    const canDeleteWithoutActiveLink = !current.paymentLinkToken && isNonPaidQuote;
    const canDeleteByStatus = current.status === "PENDING" || current.status === "REJECTED";

    if (!canDeleteByStatus && !canDeleteWithoutActiveLink) {
      throw new BadRequestException(
        "Only PENDING or REJECTED quotes, or non-paid quotes without an active payment link, can be soft-deleted."
      );
    }

    if (current.order?.id) {
      throw new BadRequestException(
        "Cannot delete a quote that already has a linked order/payment record."
      );
    }

    const deletedAt = new Date().toISOString();
    const reason = input.reason.trim();

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: QUOTE_SOFT_DELETED_ACTION,
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        details: {
          reason,
          previousStatus: current.status,
          deletedAt,
        },
      },
    });

    return {
      id: quoteId,
      deleted: true,
      deletedAt,
    };
  }

  private async sendQuoteEmails(params: {
    quoteId: string;
    locale: Locale;
    workingTitle: string;
    estimatedWordCount: number;
    bookSize: CreateQuoteInput["bookSize"];
    quantity: number;
    coverType: CreateQuoteInput["coverType"];
    hasSpecialReqs: boolean;
    specialRequirements: CreateQuoteInput["specialRequirements"];
    specialRequirementsOther: string | null;
    fullName: string;
    email: string;
    phone: string;
    estimatedPriceLow: number | null;
    estimatedPriceHigh: number | null;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set - quote emails skipped");
      return;
    }

    if (!this.quoteFromEmail) {
      this.logger.warn("Quote sender email not configured in env - quote emails skipped");
      return;
    }

    try {
      const firstName = params.fullName.split(/\s+/)[0] || params.fullName;
      const userRendered = await renderQuoteReceivedEmail({
        locale: params.locale,
        referenceNumber: params.quoteId,
        userName: firstName,
        email: params.email,
        phone: params.phone,
        workingTitle: params.workingTitle,
        estimatedWordCount: params.estimatedWordCount,
        bookSize: params.bookSize,
        quantity: params.quantity,
        coverType: params.coverType,
        hasSpecialReqs: params.hasSpecialReqs,
        specialRequirements: params.specialRequirements,
        specialRequirementsOther: params.specialRequirementsOther,
        estimatedPriceLow: params.estimatedPriceLow,
        estimatedPriceHigh: params.estimatedPriceHigh,
      });

      const userSendResult = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: params.email,
        subject: userRendered.subject,
        html: userRendered.html,
      });

      if (userSendResult.error) {
        this.logger.error(
          `Failed to send quote user email: ${userSendResult.error.name} - ${userSendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to send quote user email", error);
    }

    if (this.quoteAdminRecipients.length === 0) {
      this.logger.warn("Quote admin recipient email not configured in env - admin email skipped");
      return;
    }

    try {
      const adminRendered = await renderQuoteAdminNotificationEmail({
        locale: params.locale,
        referenceNumber: params.quoteId,
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        workingTitle: params.workingTitle,
        estimatedWordCount: params.estimatedWordCount,
        bookSize: params.bookSize,
        quantity: params.quantity,
        coverType: params.coverType,
        hasSpecialReqs: params.hasSpecialReqs,
        specialRequirements: params.specialRequirements,
        specialRequirementsOther: params.specialRequirementsOther,
        estimatedPriceLow: params.estimatedPriceLow,
        estimatedPriceHigh: params.estimatedPriceHigh,
        adminPanelUrl: this.buildQuoteAdminPanelUrl(params.quoteId),
      });

      const adminSendResult = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: this.quoteAdminRecipients,
        subject: adminRendered.subject,
        html: adminRendered.html,
      });

      if (adminSendResult.error) {
        this.logger.error(
          `Failed to send quote admin email: ${adminSendResult.error.name} - ${adminSendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to send quote admin email", error);
    }
  }

  private resolveQuoteFromEmail(): string | null {
    const candidates = [
      process.env.QUOTE_FROM_EMAIL,
      process.env.ADMIN_FROM_EMAIL,
      process.env.CONTACT_FROM_EMAIL,
      process.env.DEFAULT_FROM_EMAIL,
    ];

    for (const candidate of candidates) {
      if (candidate && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return null;
  }

  private resolveQuoteAdminRecipients(): string[] {
    const sources = [
      process.env.QUOTE_ADMIN_EMAILS,
      process.env.ADMIN_NOTIFICATION_EMAIL,
      process.env.CONTACT_ADMIN_EMAIL,
      process.env.ADMIN_FROM_EMAIL,
    ];

    const recipients = sources
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .flatMap((value) => value.split(","))
      .map((value) => this.extractEmailAddress(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return Array.from(new Set(recipients));
  }

  private extractEmailAddress(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) return null;

    const bracketMatch = normalized.match(/<([^>]+)>/);
    const candidate = bracketMatch?.[1]?.trim() || normalized;
    if (!candidate.includes("@")) return null;
    return candidate;
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

  private normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  private buildQuoteAdminPanelUrl(quoteId: string): string {
    if (!this.frontendBaseUrl) return "";
    return `${this.frontendBaseUrl}/admin/quotes/${quoteId}`;
  }

  private buildPublicPaymentLinkUrl(token: string): string {
    return `${this.frontendBaseUrl}/pay/${token}`;
  }

  private assertQuoteCanGeneratePaymentLink(quote: {
    status: string;
    finalPrice: Prisma.Decimal | null;
    paymentLinkToken: string | null;
    paymentLinkExpiresAt: Date | null;
  }): void {
    if (quote.status === "PAID" || quote.status === "COMPLETED") {
      throw new BadRequestException(
        "Paid quotes cannot generate a new payment link unless reopened."
      );
    }

    if (!PAYABLE_QUOTE_STATUSES.has(quote.status)) {
      throw new BadRequestException(
        `Quote status "${quote.status}" is not payable and cannot receive a payment link.`
      );
    }

    if (quote.finalPrice == null && quote.status === "PAYMENT_LINK_SENT") {
      throw new BadRequestException(
        "Quote finalPrice is missing. Set finalPrice before generating a payment link."
      );
    }
  }

  private hasActivePaymentLink(token: string | null, expiresAt: Date | null): boolean {
    if (!token || !expiresAt) {
      return false;
    }

    return expiresAt.getTime() > Date.now();
  }

  private async isRevokedPaymentToken(token: string): Promise<boolean> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: "CUSTOM_QUOTE",
        action: "CUSTOM_QUOTE_PAYMENT_LINK_REVOKED",
      },
      select: {
        details: true,
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    return rows.some((row) => {
      const details = row.details as Prisma.JsonObject | null;
      return details?.revokedToken === token;
    });
  }

  private generatePaymentReference(prefix = "qt"): string {
    const randomPart = randomBytes(8).toString("hex").slice(0, 12);
    return `${prefix}-${Date.now()}-${randomPart}`;
  }

  private buildAdminQuotesWhere(
    query: AdminQuotesListQuery,
    softDeletedQuoteIds: string[] = []
  ): Prisma.CustomQuoteWhereInput {
    const andClauses: Prisma.CustomQuoteWhereInput[] = [];

    if (softDeletedQuoteIds.length > 0) {
      andClauses.push({
        id: {
          notIn: softDeletedQuoteIds,
        },
      });
    }

    if (query.status) {
      andClauses.push({
        status: query.status,
      });
    }

    const normalizedSearch = query.q?.trim();
    if (normalizedSearch) {
      andClauses.push({
        OR: [
          {
            fullName: {
              contains: normalizedSearch,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: normalizedSearch,
              mode: "insensitive",
            },
          },
          {
            workingTitle: {
              contains: normalizedSearch,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    return andClauses.length > 0 ? { AND: andClauses } : {};
  }

  private async getSoftDeletedQuoteIds(): Promise<string[]> {
    const deletedLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: "CUSTOM_QUOTE",
        action: QUOTE_SOFT_DELETED_ACTION,
      },
      select: {
        entityId: true,
      },
      distinct: ["entityId"],
    });

    return deletedLogs
      .map((log) => log.entityId)
      .filter((entityId): entityId is string => Boolean(entityId));
  }

  private buildAdminQuotesOrderBy(
    sortBy: AdminQuoteSortField,
    sortDirection: AdminQuoteSortDirection
  ): Prisma.CustomQuoteOrderByWithRelationInput[] {
    const direction: Prisma.SortOrder = sortDirection;

    const primaryOrderBy: Prisma.CustomQuoteOrderByWithRelationInput = {
      [sortBy]: direction,
    };

    if (sortBy === "createdAt") {
      return [primaryOrderBy];
    }

    return [primaryOrderBy, { createdAt: "desc" }];
  }

  private serializeAdminQuoteListItem(row: {
    id: string;
    fullName: string;
    email: string;
    workingTitle: string;
    bookPrintSize: string;
    quantity: number;
    hasSpecialReqs: boolean;
    estimatedPriceLow: Prisma.Decimal | null;
    estimatedPriceHigh: Prisma.Decimal | null;
    status: string;
    paymentLinkToken: string | null;
    paymentLinkUrl: string | null;
    paymentLinkExpiresAt: Date | null;
    order: { id: string } | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminQuotesListResponse["items"][number] {
    const estimatedPriceLow = this.toNumber(row.estimatedPriceLow);
    const estimatedPriceHigh = this.toNumber(row.estimatedPriceHigh);
    const estimate = this.buildEstimatePresentation(
      row.hasSpecialReqs,
      estimatedPriceLow,
      estimatedPriceHigh
    );

    const actions = this.resolveQuoteActionAvailability({
      status: row.status,
      hasOrder: Boolean(row.order?.id),
      isArchived: false,
      isDeleted: false,
      paymentLinkToken: row.paymentLinkToken,
      paymentLinkExpiresAt: row.paymentLinkExpiresAt,
    });

    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      workingTitle: row.workingTitle,
      bookPrintSize: this.toBookSize(row.bookPrintSize),
      quantity: row.quantity,
      estimate,
      status: this.toQuoteStatus(row.status),
      paymentLinkStatus: this.resolvePaymentLinkDisplayStatus({
        status: row.status,
        token: row.paymentLinkToken,
        expiresAt: row.paymentLinkExpiresAt,
      }),
      actions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private resolveQuoteActionAvailability(params: {
    status: string;
    hasOrder: boolean;
    isArchived: boolean;
    isDeleted: boolean;
    paymentLinkToken: string | null;
    paymentLinkExpiresAt: Date | null;
  }): {
    canReject: boolean;
    canArchive: boolean;
    canDelete: boolean;
    canRevokePaymentLink: boolean;
  } {
    if (params.isDeleted) {
      return {
        canReject: false,
        canArchive: false,
        canDelete: false,
        canRevokePaymentLink: false,
      };
    }

    const canReject = params.status !== "PAID" && params.status !== "COMPLETED";
    const canArchive = !params.isArchived;
    const isNonPaidQuote = params.status !== "PAID" && params.status !== "COMPLETED";
    const canDelete =
      !params.hasOrder &&
      (params.status === "PENDING" ||
        params.status === "REJECTED" ||
        (!params.paymentLinkToken && isNonPaidQuote));
    const canRevokePaymentLink =
      params.status !== "PAID" &&
      params.status !== "COMPLETED" &&
      Boolean(params.paymentLinkToken && params.paymentLinkExpiresAt);

    return {
      canReject,
      canArchive,
      canDelete,
      canRevokePaymentLink,
    };
  }

  private async assertQuoteNotSoftDeleted(quoteId: string): Promise<void> {
    const existingDeleteLog = await this.prisma.auditLog.findFirst({
      where: {
        entityType: "CUSTOM_QUOTE",
        entityId: quoteId,
        action: QUOTE_SOFT_DELETED_ACTION,
      },
      select: {
        id: true,
      },
    });

    if (existingDeleteLog) {
      throw new NotFoundException(`Custom quote "${quoteId}" not found`);
    }
  }

  private buildEstimatePresentation(
    hasSpecialReqs: boolean,
    estimatedPriceLow: number | null,
    estimatedPriceHigh: number | null
  ): QuoteEstimatePresentation {
    if (hasSpecialReqs || estimatedPriceLow == null || estimatedPriceHigh == null) {
      return {
        mode: "MANUAL_REQUIRED",
        estimatedPriceLow: null,
        estimatedPriceHigh: null,
        label: "Manual pricing required",
      };
    }

    return {
      mode: "RANGE",
      estimatedPriceLow,
      estimatedPriceHigh,
      label: `${this.formatNaira(estimatedPriceLow)} - ${this.formatNaira(estimatedPriceHigh)}`,
    };
  }

  private buildPaymentLinkSummary(params: {
    status: string;
    paymentLinkToken: string | null;
    paymentLinkUrl: string | null;
    paymentLinkExpiresAt: Date | null;
    updatedAt: Date;
  }): QuotePaymentLinkSummary {
    const hasLink = Boolean(params.paymentLinkToken && params.paymentLinkExpiresAt);

    return {
      token: params.paymentLinkToken,
      url: params.paymentLinkUrl,
      expiresAt: params.paymentLinkExpiresAt?.toISOString() ?? null,
      generatedAt: hasLink ? params.updatedAt.toISOString() : null,
      displayStatus: this.resolvePaymentLinkDisplayStatus({
        status: params.status,
        token: params.paymentLinkToken,
        expiresAt: params.paymentLinkExpiresAt,
      }),
      validityDays: QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
    };
  }

  private resolvePaymentLinkDisplayStatus(params: {
    status: string;
    token: string | null;
    expiresAt: Date | null;
  }): QuotePaymentLinkDisplayStatus {
    if (params.status === "PAID" || params.status === "COMPLETED") {
      return "PAID";
    }

    if (!params.token || !params.expiresAt) {
      return "NOT_SENT";
    }

    if (params.expiresAt.getTime() <= Date.now()) {
      return "EXPIRED";
    }

    return "SENT";
  }

  private async generateUniquePaymentLinkToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(PAYMENT_LINK_TOKEN_BYTES).toString("base64url");
      const existing = await this.prisma.customQuote.findUnique({
        where: { paymentLinkToken: token },
        select: { id: true },
      });

      if (!existing) {
        return token;
      }
    }

    throw new BadRequestException("Unable to generate a unique payment link token. Please retry.");
  }

  private parseSpecialRequirements(input: Prisma.JsonValue | null): QuoteSpecialRequirement[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const allowed = new Set<QuoteSpecialRequirement>([
      "hardback",
      "embossing",
      "gold_foil",
      "special_size",
      "full_color_interior",
      "special_paper",
      "other",
    ]);

    return input
      .filter((value): value is string => typeof value === "string")
      .filter((value): value is QuoteSpecialRequirement =>
        allowed.has(value as QuoteSpecialRequirement)
      );
  }

  private toBookSize(value: string): QuoteEstimateInput["bookSize"] {
    if (value === "A4" || value === "A5" || value === "A6") {
      return value;
    }

    return "A5";
  }

  private toCoverType(value: string): CreateQuoteInput["coverType"] {
    if (value === "paperback") {
      return value;
    }

    return "paperback";
  }

  private toQuoteStatus(value: string): AdminQuoteDetail["status"] {
    switch (value) {
      case "PENDING":
      case "REVIEWING":
      case "PAYMENT_LINK_SENT":
      case "PAID":
      case "COMPLETED":
      case "REJECTED":
        return value;
      default:
        return "PENDING";
    }
  }

  private toNumber(value: Prisma.Decimal | null): number | null {
    if (value == null) return null;
    return Number(value);
  }

  private formatNaira(amount: number): string {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private async getEstimatorSettings(): Promise<QuoteEstimatorSettings> {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: [QUOTE_COST_PER_PAGE_KEY, QUOTE_COVER_COST_KEY] },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      costPerPage: this.parseSettingNumber(
        values.get(QUOTE_COST_PER_PAGE_KEY),
        DEFAULT_QUOTE_COST_PER_PAGE
      ),
      coverCost: this.parseSettingNumber(
        values.get(QUOTE_COVER_COST_KEY),
        DEFAULT_QUOTE_COVER_COST
      ),
    };
  }

  private parseSettingNumber(value: string | undefined, fallback: number): number {
    if (value == null) return fallback;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private applyBookSizeMultiplier(
    totalA5: number,
    bookSize: QuoteEstimateInput["bookSize"]
  ): number {
    if (bookSize === "A4") {
      return totalA5 * 2;
    }

    if (bookSize === "A6") {
      return totalA5 / 2;
    }

    return totalA5;
  }

  private normalizeSpecialRequirements(
    specialRequirements: CreateQuoteInput["specialRequirements"],
    hasSpecialReqs: boolean
  ): CreateQuoteInput["specialRequirements"] {
    if (!hasSpecialReqs) {
      return [];
    }

    return Array.from(new Set(specialRequirements));
  }

  private normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized;
  }

  private resolveLocale(nextLocale?: string, acceptLanguage?: string): Locale {
    const fromCookie = this.normalizeLocale(nextLocale);
    if (fromCookie) return fromCookie;

    if (acceptLanguage) {
      const candidates = acceptLanguage
        .split(",")
        .map((part) => part.split(";")[0]?.trim())
        .filter(Boolean);

      for (const candidate of candidates) {
        const normalized = this.normalizeLocale(candidate);
        if (normalized) return normalized;

        const shortCode = candidate.toLowerCase().slice(0, 2);
        const normalizedShortCode = this.normalizeLocale(shortCode);
        if (normalizedShortCode) return normalizedShortCode;
      }
    }

    return "en";
  }

  private normalizeLocale(value: string | undefined): Locale | null {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "fr") return "fr";
    if (normalized === "es") return "es";
    if (normalized === "en") return "en";
    return null;
  }

  /**
   * Optional reCAPTCHA check for the public quote form.
   * - No secret key: skip verification
   * - Non-production: skip verification
   * - No token provided: skip verification (optional)
   */
  private async verifyRecaptcha(token?: string): Promise<boolean> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn("RECAPTCHA_SECRET_KEY not set — skipping verification");
      return true;
    }

    if (process.env.NODE_ENV !== "production") {
      this.logger.warn("Development mode — skipping reCAPTCHA verification");
      return true;
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      return true;
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: normalizedToken }),
        signal: AbortSignal.timeout(5000),
      });

      const data = (await response.json()) as { success?: boolean; score?: number };
      return data.success === true && (data.score === undefined || data.score >= 0.5);
    } catch (error) {
      this.logger.error("reCAPTCHA verification failed", error);
      return false;
    }
  }
}
