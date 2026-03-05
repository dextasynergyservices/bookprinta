import type {
  BookStatus,
  OrderDetailResponse,
  OrderInvoiceArchiveResponse,
  OrderStatus,
  OrdersListResponse,
  OrderTrackingResponse,
  TrackingSource,
  TrackingState,
} from "@bookprinta/shared";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { OrdersListQueryDto } from "./dto/order.dto.js";
import { renderOrderInvoiceHtml } from "./order-invoice.template.js";

type TrackingEventRow = {
  id: string;
  source: TrackingSource;
  status: string;
  reachedAt: string;
  label: string;
  createdAt: string;
};

type FallbackInvoicePdfInput = {
  invoiceNumber: string;
  issuedAt: string;
  orderNumber: string;
  packageName: string;
  paymentStatus: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  packageAmount: number;
  addonsSubtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingFee: number;
  grandTotal: number;
  currency: string;
  addonLines: Array<{
    name: string;
    amount: number;
  }>;
  legalName: string;
  legalAddress: string;
  legalEmail: string;
  legalPhone: string;
  supportSla: string;
  refundPolicy: string;
  termsNotice: string;
  complianceNote: string;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  private static readonly ORDER_TRACKING_ENTITY_TYPE = "ORDER_TRACKING";
  private static readonly ORDER_TRACKING_ACTION = "ORDER_STATUS_REACHED";
  private static readonly ORDER_INVOICE_ENTITY_TYPE = "ORDER_INVOICE";
  private static readonly ORDER_INVOICE_ACTION = "ORDER_INVOICE_ARCHIVED";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService
  ) {}

  private static readonly ORDER_LIST_SELECT = {
    id: true,
    orderNumber: true,
    orderType: true,
    status: true,
    createdAt: true,
    totalAmount: true,
    currency: true,
    package: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    book: {
      select: {
        id: true,
        status: true,
      },
    },
  } as const;

  private static readonly ORDER_DETAIL_SELECT = {
    id: true,
    orderNumber: true,
    orderType: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    copies: true,
    bookSize: true,
    paperColor: true,
    lamination: true,
    initialAmount: true,
    extraAmount: true,
    discountAmount: true,
    totalAmount: true,
    refundAmount: true,
    currency: true,
    trackingNumber: true,
    shippingProvider: true,
    package: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    book: {
      select: {
        id: true,
        status: true,
      },
    },
    payments: {
      select: {
        id: true,
        provider: true,
        status: true,
        type: true,
        amount: true,
        currency: true,
        providerRef: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc" as const,
      },
    },
    addons: {
      select: {
        id: true,
        addonId: true,
        priceSnap: true,
        wordCount: true,
        addon: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        id: "asc" as const,
      },
    },
  } as const;

  private static readonly ORDER_INVOICE_SELECT = {
    ...OrdersService.ORDER_DETAIL_SELECT,
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
  } as const;

  private static readonly ORDER_TRACKING_SELECT = {
    id: true,
    orderNumber: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    trackingNumber: true,
    shippingProvider: true,
    book: {
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  } as const;

  private readonly issueOrderStatuses = new Set<OrderStatus>([
    "ACTION_REQUIRED",
    "CANCELLED",
    "REFUNDED",
  ]);

  private readonly orderTrackingStages: OrderStatus[] = [
    "PENDING_PAYMENT",
    "PENDING_PAYMENT_APPROVAL",
    "PAID",
    "PROCESSING",
    "AWAITING_UPLOAD",
    "FORMATTING",
    "PREVIEW_READY",
    "APPROVED",
    "IN_PRODUCTION",
    "COMPLETED",
  ];

  private readonly bookTrackingStages: BookStatus[] = [
    "AWAITING_UPLOAD",
    "UPLOADED",
    "PAYMENT_RECEIVED",
    "AI_PROCESSING",
    "DESIGNING",
    "DESIGNED",
    "FORMATTING",
    "FORMATTED",
    "FORMATTING_REVIEW",
    "PREVIEW_READY",
    "REVIEW",
    "APPROVED",
    "IN_PRODUCTION",
    "PRINTING",
    "PRINTED",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
  ];

  async findUserOrders(userId: string, query: OrdersListQueryDto): Promise<OrdersListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 10;
    const skip = (page - 1) * pageSize;

    const [rows, totalItems] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: OrdersService.ORDER_LIST_SELECT,
      }),
      this.prisma.order.count({
        where: { userId },
      }),
    ]);

    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

    return {
      items: rows.map((row) => this.serializeListItem(row)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  }

  async findUserOrderById(userId: string, orderId: string): Promise<OrderDetailResponse> {
    const row = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      select: OrdersService.ORDER_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    return {
      ...this.serializeListItem(row),
      updatedAt: row.updatedAt.toISOString(),
      copies: row.copies,
      bookSize: row.bookSize,
      paperColor: row.paperColor,
      lamination: row.lamination,
      initialAmount: this.toNumber(row.initialAmount),
      extraAmount: this.toNumber(row.extraAmount),
      discountAmount: this.toNumber(row.discountAmount),
      refundAmount: this.toNumber(row.refundAmount),
      trackingNumber: row.trackingNumber ?? null,
      shippingProvider: row.shippingProvider ?? null,
      addons: row.addons.map((addon) => ({
        id: addon.id,
        addonId: addon.addonId,
        name: addon.addon.name,
        price: this.toNumber(addon.priceSnap),
        wordCount: addon.wordCount ?? null,
      })),
      payments: row.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        status: payment.status,
        type: payment.type,
        amount: this.toNumber(payment.amount),
        currency: payment.currency,
        providerRef: payment.providerRef ?? null,
        createdAt: payment.createdAt.toISOString(),
      })),
    };
  }

  async appendTrackingEvent(params: {
    orderId: string;
    userId?: string | null;
    source: TrackingSource;
    status: string;
    reachedAt?: string | Date | null;
  }): Promise<void> {
    const normalizedStatus = this.normalizeStatus(params.status);
    if (!normalizedStatus) return;

    const reachedAtIso = this.toIsoDateTime(params.reachedAt) ?? new Date().toISOString();
    const latestEntry = await this.prisma.auditLog.findFirst({
      where: {
        action: OrdersService.ORDER_TRACKING_ACTION,
        entityType: OrdersService.ORDER_TRACKING_ENTITY_TYPE,
        entityId: params.orderId,
      },
      orderBy: { createdAt: "desc" },
    });

    const latest = latestEntry ? this.parseTrackingEventRow(latestEntry) : null;
    if (
      latest &&
      latest.source === params.source &&
      latest.status === normalizedStatus &&
      latest.reachedAt === reachedAtIso
    ) {
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: OrdersService.ORDER_TRACKING_ACTION,
        entityType: OrdersService.ORDER_TRACKING_ENTITY_TYPE,
        entityId: params.orderId,
        details: {
          source: params.source,
          status: normalizedStatus,
          reachedAt: reachedAtIso,
          label: this.toTrackingLabel(normalizedStatus),
        },
      },
    });
  }

  async getUserOrderTracking(userId: string, orderId: string): Promise<OrderTrackingResponse> {
    const row = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      select: OrdersService.ORDER_TRACKING_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    await this.ensureTrackingEventsForOrder(row, userId);
    const persistedEvents = await this.readTrackingEvents(row.id);

    const book = row.book;
    const shouldUseOrderSource = this.issueOrderStatuses.has(row.status) || !book;
    const timeline =
      persistedEvents.length > 0
        ? this.toTrackingTimelineFromEvents({
            events: persistedEvents,
            shouldUseOrderSource,
            currentOrderStatus: row.status,
            currentBookStatus: row.book?.status ?? null,
          })
        : shouldUseOrderSource
          ? this.buildProgressTimeline({
              stages: this.orderTrackingStages,
              currentStatus: row.status,
              source: "order",
              startedAt: row.createdAt,
              updatedAt: row.updatedAt,
            })
          : this.buildProgressTimeline({
              stages: this.bookTrackingStages,
              currentStatus: book.status,
              source: "book",
              startedAt: book.createdAt,
              updatedAt: book.updatedAt,
            });

    const latestEventReachedAt = timeline[timeline.length - 1]?.reachedAt ?? null;
    const currentUpdatedAt = shouldUseOrderSource
      ? row.updatedAt.toISOString()
      : (row.book?.updatedAt ?? row.updatedAt).toISOString();

    return {
      orderId: row.id,
      orderNumber: row.orderNumber,
      bookId: row.book?.id ?? null,
      currentOrderStatus: row.status,
      currentBookStatus: row.book?.status ?? null,
      rejectionReason: row.book?.rejectionReason ?? null,
      trackingNumber: row.trackingNumber ?? null,
      shippingProvider: row.shippingProvider ?? null,
      updatedAt: latestEventReachedAt ?? currentUpdatedAt,
      timeline,
    };
  }

  async getUserOrderInvoiceArchive(
    userId: string,
    orderId: string
  ): Promise<OrderInvoiceArchiveResponse> {
    const order = await this.getOrderForInvoiceOrThrow(userId, orderId);
    const existingArchive = await this.readLatestInvoiceArchive(order.id);
    if (existingArchive) {
      return existingArchive;
    }

    const { archive } = await this.generateAndArchiveOrderInvoice(order, userId);
    return archive;
  }

  async downloadUserOrderInvoice(
    userId: string,
    orderId: string
  ): Promise<{ fileName: string; invoiceNumber: string; buffer: Buffer }> {
    const order = await this.getOrderForInvoiceOrThrow(userId, orderId);
    const existingArchive = await this.readLatestInvoiceArchive(order.id);

    if (existingArchive) {
      try {
        const arrayBuffer = await this.fetchArchivedInvoiceArrayBuffer(
          existingArchive.archivedUrl,
          orderId
        );
        return {
          fileName: existingArchive.fileName,
          invoiceNumber: existingArchive.invoiceNumber,
          buffer: Buffer.from(arrayBuffer),
        };
      } catch (error) {
        this.logger.warn(
          `Archived invoice for order ${orderId} is not directly downloadable; regenerating and streaming from source.`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    const generated = await this.generateAndArchiveOrderInvoice(order, userId);
    return {
      fileName: generated.archive.fileName,
      invoiceNumber: generated.archive.invoiceNumber,
      buffer: generated.pdfBuffer,
    };
  }

  private async generateAndArchiveOrderInvoice(
    row: Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_INVOICE_SELECT }>,
    userId: string
  ): Promise<{ archive: OrderInvoiceArchiveResponse; pdfBuffer: Buffer }> {
    const issuedAt = new Date().toISOString();
    const invoiceNumber = this.buildInvoiceNumber(row.orderNumber, row.createdAt);
    const fileName = `bookprinta-invoice-${invoiceNumber}.pdf`;
    const locale = "en";
    const legal = this.resolveLegalEntity();

    const packageAmount = this.toNumber(row.initialAmount);
    const addonsSubtotal = row.addons.reduce(
      (sum, addon) => sum + this.toNumber(addon.priceSnap),
      0
    );
    const discountAmount = this.toNumber(row.discountAmount);
    const taxAmount = 0;
    const shippingFee = 0;
    const grandTotal = this.toNumber(row.totalAmount);
    const currency = row.currency;

    const primaryPayment =
      row.payments.find((payment) => payment.status === "SUCCESS") ?? row.payments[0] ?? null;
    const paymentReference = primaryPayment?.providerRef ?? primaryPayment?.id ?? null;

    const paymentHistory = row.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      type: payment.type,
      amount: this.toNumber(payment.amount),
      currency: payment.currency,
      providerRef: payment.providerRef ?? null,
      createdAt: payment.createdAt.toISOString(),
    }));

    const supportSla = "Mon-Fri, 09:00-18:00 WAT. Response target: 24 hours.";
    const refundPolicy =
      "Refund requests are reviewed based on work stage and policy terms. Final decision within 5 business days.";
    const termsNotice =
      "All invoices are charged in NGN. International banks may apply their own exchange rates and processing fees.";
    const complianceNote =
      "By paying this invoice, you agree to BookPrinta publishing terms, payment verification checks, and production policies.";

    const invoiceHtml = renderOrderInvoiceHtml({
      locale,
      invoiceNumber,
      issuedAt: this.formatDateTime(issuedAt, locale),
      orderNumber: row.orderNumber,
      packageName: row.package.name,
      paymentReference,
      paymentProvider: primaryPayment?.provider ?? null,
      paymentStatus: primaryPayment?.status ?? null,
      paidAt: primaryPayment?.createdAt
        ? this.formatDateTime(primaryPayment.createdAt, locale)
        : null,
      legalName: legal.legalName,
      legalAddress: legal.address,
      legalEmail: legal.supportEmail,
      legalPhone: legal.supportPhone,
      legalTaxId: legal.taxId,
      packageAmount: this.formatCurrency(packageAmount, currency, locale),
      addonsSubtotal: this.formatCurrency(addonsSubtotal, currency, locale),
      discountAmount: `-${this.formatCurrency(discountAmount, currency, locale)}`,
      taxAmount: this.formatCurrency(taxAmount, currency, locale),
      shippingFee: this.formatCurrency(shippingFee, currency, locale),
      grandTotal: this.formatCurrency(grandTotal, currency, locale),
      currency,
      addonLines: row.addons.map((addon) => ({
        name: addon.addon.name,
        amount: this.formatCurrency(this.toNumber(addon.priceSnap), currency, locale),
      })),
      paymentHistory: paymentHistory.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        status: payment.status,
        type: payment.type,
        amount: this.formatCurrency(payment.amount, payment.currency, locale),
        currency: payment.currency,
        reference: payment.providerRef,
        createdAt: this.formatDateTime(payment.createdAt, locale),
      })),
      supportSla,
      refundPolicy,
      termsNotice,
      complianceNote,
    });

    const pdfBuffer = await this.renderInvoicePdf(invoiceHtml, {
      invoiceNumber,
      issuedAt: this.formatDateTime(issuedAt, locale),
      orderNumber: row.orderNumber,
      packageName: row.package.name,
      paymentStatus: primaryPayment?.status ?? null,
      paymentProvider: primaryPayment?.provider ?? null,
      paymentReference,
      packageAmount,
      addonsSubtotal,
      discountAmount,
      taxAmount,
      shippingFee,
      grandTotal,
      currency,
      addonLines: row.addons.map((addon) => ({
        name: addon.addon.name,
        amount: this.toNumber(addon.priceSnap),
      })),
      legalName: legal.legalName,
      legalAddress: legal.address,
      legalEmail: legal.supportEmail,
      legalPhone: legal.supportPhone,
      supportSla,
      refundPolicy,
      termsNotice,
      complianceNote,
    });
    const archiveResult = await this.cloudinary.upload(pdfBuffer, {
      folder: "bookprinta/invoices",
      resource_type: "raw",
      type: "upload",
      public_id: `invoice-${row.orderNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      format: "pdf",
      overwrite: true,
    });

    const archivePayload: OrderInvoiceArchiveResponse = {
      orderId: row.id,
      orderNumber: row.orderNumber,
      invoiceNumber,
      fileName,
      archivedUrl: archiveResult.secure_url,
      generatedAt: new Date().toISOString(),
      issuedAt,
      paymentReference,
      legal: {
        legalName: legal.legalName,
        address: legal.address,
        supportEmail: legal.supportEmail,
        supportPhone: legal.supportPhone,
        taxId: legal.taxId,
      },
      financialBreakdown: {
        packageAmount,
        addonsSubtotal,
        discountAmount,
        taxAmount,
        shippingFee,
        grandTotal,
        currency,
      },
      paymentProof: {
        provider: primaryPayment?.provider ?? null,
        status: primaryPayment?.status ?? null,
        reference: paymentReference,
        paidAt: primaryPayment?.createdAt?.toISOString() ?? null,
        history: paymentHistory,
      },
    };

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: OrdersService.ORDER_INVOICE_ACTION,
        entityType: OrdersService.ORDER_INVOICE_ENTITY_TYPE,
        entityId: row.id,
        details: archivePayload,
      },
    });

    return {
      archive: archivePayload,
      pdfBuffer,
    };
  }

  private async getOrderForInvoiceOrThrow(
    userId: string,
    orderId: string
  ): Promise<Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_INVOICE_SELECT }>> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      select: OrdersService.ORDER_INVOICE_SELECT,
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    return order;
  }

  private async readLatestInvoiceArchive(
    orderId: string
  ): Promise<OrderInvoiceArchiveResponse | null> {
    const existingArchiveLog = await this.prisma.auditLog.findFirst({
      where: {
        action: OrdersService.ORDER_INVOICE_ACTION,
        entityType: OrdersService.ORDER_INVOICE_ENTITY_TYPE,
        entityId: orderId,
      },
      orderBy: { createdAt: "desc" },
    });

    return existingArchiveLog ? this.parseInvoiceArchive(existingArchiveLog.details) : null;
  }

  private async renderInvoicePdf(
    html: string,
    fallbackInput: FallbackInvoicePdfInput
  ): Promise<Buffer> {
    const gotenbergBaseUrl = (process.env.GOTENBERG_URL ?? "").replace(/\/+$/, "");
    if (!gotenbergBaseUrl) {
      this.logger.warn("Gotenberg is not configured, using fallback invoice PDF renderer");
      return this.renderFallbackInvoicePdf(fallbackInput);
    }

    const maxAttempts = 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const form = new FormData();
      form.append("files", new Blob([html], { type: "text/html;charset=utf-8" }), "index.html");
      form.append("paperWidth", "8.27");
      form.append("paperHeight", "11.69");
      form.append("marginTop", "0.4");
      form.append("marginBottom", "0.4");
      form.append("marginLeft", "0.35");
      form.append("marginRight", "0.35");
      form.append("printBackground", "true");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);

      let response: Response | null = null;
      try {
        response = await fetch(`${gotenbergBaseUrl}/forms/chromium/convert/html`, {
          method: "POST",
          body: form,
          signal: controller.signal,
          headers: this.buildGotenbergAuthHeaders(),
        });
      } catch (error) {
        this.logger.error(`Gotenberg request failed on attempt ${attempt}`, error);
      } finally {
        clearTimeout(timeout);
      }

      if (response?.ok) {
        const pdfArrayBuffer = await response.arrayBuffer();
        return Buffer.from(pdfArrayBuffer);
      }

      if (response) {
        const bodySnippet = await response
          .text()
          .then((value) => value.slice(0, 400))
          .catch(() => "");
        this.logger.error(
          `Gotenberg returned ${response.status} on attempt ${attempt} while generating invoice PDF. ${bodySnippet}`
        );
      }

      if (attempt < maxAttempts) {
        await this.delay(400 * attempt);
      }
    }

    this.logger.warn("Falling back to internal invoice PDF renderer after Gotenberg failures");
    return this.renderFallbackInvoicePdf(fallbackInput);
  }

  private async fetchArchivedInvoiceArrayBuffer(
    archivedUrl: string,
    orderId: string
  ): Promise<ArrayBuffer> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response | null = null;
      try {
        response = await fetch(archivedUrl, {
          method: "GET",
        });
      } catch (error) {
        this.logger.error(
          `Unable to fetch archived invoice for order ${orderId}: network failure on attempt ${attempt}`,
          error
        );
      }

      if (response?.ok) {
        return response.arrayBuffer();
      }

      if (response) {
        this.logger.error(
          `Unable to fetch archived invoice for order ${orderId}: HTTP ${response.status} on attempt ${attempt}`
        );
      }

      if (attempt < maxAttempts) {
        await this.delay(500 * attempt);
      }
    }

    throw new InternalServerErrorException("Unable to fetch archived invoice");
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildGotenbergAuthHeaders(): Record<string, string> {
    const username = process.env.GOTENBERG_USERNAME?.trim();
    const password = process.env.GOTENBERG_PASSWORD?.trim();

    if (!username || !password) {
      return {};
    }

    const token = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
    return {
      Authorization: `Basic ${token}`,
    };
  }

  private renderFallbackInvoicePdf(input: FallbackInvoicePdfInput): Buffer {
    const lines: string[] = [
      "BOOKPRINTA INVOICE",
      `Invoice No: ${input.invoiceNumber}`,
      `Issued On: ${input.issuedAt}`,
      `Order Ref: ${input.orderNumber}`,
      "",
      `Package: ${input.packageName}`,
      `Payment Status: ${input.paymentStatus ?? "Unavailable"}`,
      `Payment Provider: ${input.paymentProvider ?? "Unavailable"}`,
      `Payment Reference: ${input.paymentReference ?? "Unavailable"}`,
      "",
      "BILLING BREAKDOWN",
      `Package Amount: ${this.formatCurrencyCode(input.packageAmount, input.currency)}`,
      `Add-ons Subtotal: ${this.formatCurrencyCode(input.addonsSubtotal, input.currency)}`,
      `Discount: -${this.formatCurrencyCode(input.discountAmount, input.currency)}`,
      `Tax/VAT: ${this.formatCurrencyCode(input.taxAmount, input.currency)}`,
      `Shipping: ${this.formatCurrencyCode(input.shippingFee, input.currency)}`,
      `TOTAL: ${this.formatCurrencyCode(input.grandTotal, input.currency)}`,
    ];

    if (input.addonLines.length > 0) {
      lines.push("", "ADD-ONS");
      input.addonLines.forEach((addon, index) => {
        lines.push(
          `${index + 1}. ${addon.name}: ${this.formatCurrencyCode(addon.amount, input.currency)}`
        );
      });
    }

    lines.push(
      "",
      "LEGAL",
      input.legalName,
      input.legalAddress,
      `Support Email: ${input.legalEmail}`,
      `Support Phone: ${input.legalPhone}`,
      "",
      `Support SLA: ${input.supportSla}`,
      `Refund Policy: ${input.refundPolicy}`,
      `Terms: ${input.termsNotice}`,
      `Compliance: ${input.complianceNote}`
    );

    return this.buildSimplePdf(lines);
  }

  private buildSimplePdf(lines: string[]): Buffer {
    const commands: string[] = [];
    let y = 800;
    const left = 44;
    const lineHeight = 15;

    const pushText = (raw: string, font: "/F1" | "/F2" = "/F1", size = 11) => {
      if (y < 44) return;
      const text = this.escapePdfText(raw);
      commands.push(`BT ${font} ${size} Tf 1 0 0 1 ${left} ${y} Tm (${text}) Tj ET`);
      y -= lineHeight;
    };

    if (lines.length > 0) {
      pushText(lines[0], "/F2", 16);
      y -= 4;
    }
    lines.slice(1).forEach((line) => {
      if (line.length === 0) {
        y -= 6;
        return;
      }

      pushText(line, "/F1", 11);
    });

    const content = commands.join("\n");
    const contentLength = Buffer.byteLength(content, "utf-8");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    objects.forEach((objectContent, index) => {
      offsets[index + 1] = Buffer.byteLength(pdf, "utf-8");
      pdf += `${index + 1} 0 obj\n${objectContent}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, "utf-8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, "utf-8");
  }

  private escapePdfText(value: string): string {
    const normalized = value
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    return normalized.length > 0 ? normalized : "-";
  }

  private formatCurrencyCode(amount: number, currency: string): string {
    const normalizedCurrency = currency.toUpperCase();
    const numeric = Number.isFinite(amount) ? amount : 0;

    return `${normalizedCurrency} ${new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric)}`;
  }

  private async ensureTrackingEventsForOrder(
    row: Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_TRACKING_SELECT }>,
    userId: string
  ): Promise<void> {
    const existingEvents = await this.readTrackingEvents(row.id);

    if (existingEvents.length === 0) {
      await this.appendTrackingEvent({
        orderId: row.id,
        userId,
        source: "order",
        status: row.status,
        reachedAt: row.createdAt,
      });
      if (row.book) {
        await this.appendTrackingEvent({
          orderId: row.id,
          userId,
          source: "book",
          status: row.book.status,
          reachedAt: row.book.createdAt,
        });
      }
    }

    await this.appendTrackingEvent({
      orderId: row.id,
      userId,
      source: "order",
      status: row.status,
      reachedAt: row.updatedAt,
    });
    if (row.book) {
      await this.appendTrackingEvent({
        orderId: row.id,
        userId,
        source: "book",
        status: row.book.status,
        reachedAt: row.book.updatedAt,
      });
    }
  }

  private async readTrackingEvents(orderId: string): Promise<TrackingEventRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: OrdersService.ORDER_TRACKING_ACTION,
        entityType: OrdersService.ORDER_TRACKING_ENTITY_TYPE,
        entityId: orderId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return rows
      .map((row) => this.parseTrackingEventRow(row))
      .filter((row): row is TrackingEventRow => Boolean(row))
      .sort((left, right) => {
        const leftTime = new Date(left.reachedAt).getTime();
        const rightTime = new Date(right.reachedAt).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return left.createdAt.localeCompare(right.createdAt);
      });
  }

  private parseTrackingEventRow(
    row: Pick<Prisma.AuditLogGetPayload<object>, "id" | "createdAt" | "details">
  ): TrackingEventRow | null {
    const details = this.toRecord(row.details);
    if (!details) return null;

    const source = this.toTrackingSource(details.source);
    const status = this.normalizeStatus(details.status);
    const reachedAt = this.toIsoDateTime(details.reachedAt) ?? row.createdAt.toISOString();
    const label =
      this.toStringValue(details.label) ?? (status ? this.toTrackingLabel(status) : null);

    if (!source || !status || !label) return null;

    return {
      id: row.id,
      source,
      status,
      reachedAt,
      label,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toTrackingTimelineFromEvents(params: {
    events: TrackingEventRow[];
    shouldUseOrderSource: boolean;
    currentOrderStatus: string;
    currentBookStatus: string | null;
  }): OrderTrackingResponse["timeline"] {
    const currentSource: TrackingSource = params.shouldUseOrderSource ? "order" : "book";
    const currentStatus = params.shouldUseOrderSource
      ? this.normalizeStatus(params.currentOrderStatus)
      : this.normalizeStatus(params.currentBookStatus);

    const currentIndexCandidate = [...params.events]
      .reverse()
      .findIndex((event) => event.source === currentSource && event.status === currentStatus);
    const currentIndex =
      currentIndexCandidate >= 0
        ? params.events.length - 1 - currentIndexCandidate
        : Math.max(params.events.length - 1, 0);

    return params.events.map((event, index) => ({
      key: `${event.source}_${event.status.toLowerCase()}_${index + 1}`,
      label: event.label,
      status: event.status,
      source: event.source,
      state: index === currentIndex ? "current" : "completed",
      reachedAt: event.reachedAt,
    }));
  }

  private parseInvoiceArchive(value: Prisma.JsonValue | null): OrderInvoiceArchiveResponse | null {
    const details = this.toRecord(value);
    if (!details) return null;

    const legal = this.toRecord(details.legal);
    const financialBreakdown = this.toRecord(details.financialBreakdown);
    const paymentProof = this.toRecord(details.paymentProof);

    if (!legal || !financialBreakdown || !paymentProof) return null;

    const historyRaw = Array.isArray(paymentProof.history) ? paymentProof.history : [];
    const history = historyRaw
      .map((entry) => {
        const row = this.toRecord(entry as Prisma.JsonValue);
        if (!row) return null;

        const id = this.toStringValue(row.id);
        const provider = this.toStringValue(row.provider);
        const status = this.toStringValue(row.status);
        const type = this.toStringValue(row.type);
        const amount = this.toNumberOrNull(row.amount);
        const currency = this.toStringValue(row.currency);
        const createdAt = this.toIsoDateTime(row.createdAt);
        if (!id || !provider || !status || !type || amount === null || !currency || !createdAt) {
          return null;
        }

        return {
          id,
          provider,
          status,
          type,
          amount,
          currency,
          providerRef: this.toStringValue(row.providerRef),
          createdAt,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const archivedUrl = this.toStringValue(details.archivedUrl);
    const orderId = this.toStringValue(details.orderId);
    const orderNumber = this.toStringValue(details.orderNumber);
    const invoiceNumber = this.toStringValue(details.invoiceNumber);
    const fileName = this.toStringValue(details.fileName);
    const generatedAt = this.toIsoDateTime(details.generatedAt);
    const issuedAt = this.toIsoDateTime(details.issuedAt);
    const packageAmount = this.toNumberOrNull(financialBreakdown.packageAmount);
    const addonsSubtotal = this.toNumberOrNull(financialBreakdown.addonsSubtotal);
    const discountAmount = this.toNumberOrNull(financialBreakdown.discountAmount);
    const taxAmount = this.toNumberOrNull(financialBreakdown.taxAmount);
    const shippingFee = this.toNumberOrNull(financialBreakdown.shippingFee);
    const grandTotal = this.toNumberOrNull(financialBreakdown.grandTotal);
    const currency = this.toStringValue(financialBreakdown.currency);

    if (
      !archivedUrl ||
      !orderId ||
      !orderNumber ||
      !invoiceNumber ||
      !fileName ||
      !generatedAt ||
      !issuedAt ||
      packageAmount === null ||
      addonsSubtotal === null ||
      discountAmount === null ||
      taxAmount === null ||
      shippingFee === null ||
      grandTotal === null ||
      !currency
    ) {
      return null;
    }

    return {
      orderId,
      orderNumber,
      invoiceNumber,
      fileName,
      archivedUrl,
      generatedAt,
      issuedAt,
      paymentReference: this.toStringValue(details.paymentReference),
      legal: {
        legalName: this.toStringValue(legal.legalName) ?? "BookPrinta",
        address: this.toStringValue(legal.address) ?? "Nigeria",
        supportEmail: this.toStringValue(legal.supportEmail) ?? "support@bookprinta.com",
        supportPhone: this.toStringValue(legal.supportPhone) ?? "+2348103208297",
        taxId: this.toStringValue(legal.taxId),
      },
      financialBreakdown: {
        packageAmount,
        addonsSubtotal,
        discountAmount,
        taxAmount,
        shippingFee,
        grandTotal,
        currency,
      },
      paymentProof: {
        provider: this.toStringValue(paymentProof.provider),
        status: this.toStringValue(paymentProof.status),
        reference: this.toStringValue(paymentProof.reference),
        paidAt: this.toIsoDateTime(paymentProof.paidAt),
        history,
      },
    };
  }

  private resolveLegalEntity() {
    return {
      legalName: process.env.BOOKPRINTA_LEGAL_NAME?.trim() || "BookPrinta Publishing Ltd",
      address: process.env.BOOKPRINTA_LEGAL_ADDRESS?.trim() || "Lagos, Nigeria",
      supportEmail: process.env.BOOKPRINTA_SUPPORT_EMAIL?.trim() || "support@bookprinta.com",
      supportPhone: process.env.BOOKPRINTA_SUPPORT_PHONE?.trim() || "+2348103208297",
      taxId: process.env.BOOKPRINTA_TAX_ID?.trim() || null,
    };
  }

  private buildInvoiceNumber(orderNumber: string, createdAt: Date): string {
    const dateToken = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
    const orderToken = orderNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return `INV-${dateToken}-${orderToken}`;
  }

  private formatCurrency(amount: number, currency: string, locale: string): string {
    const localeTag = locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG";
    return new Intl.NumberFormat(localeTag, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private formatDateTime(value: string | Date, locale: string): string {
    const localeTag = locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG";
    const parsed = value instanceof Date ? value : new Date(value);

    return new Intl.DateTimeFormat(localeTag, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  private serializeListItem(
    row: Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_LIST_SELECT }>
  ): OrdersListResponse["items"][number] {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      totalAmount: this.toNumber(row.totalAmount),
      currency: row.currency,
      package: {
        id: row.package.id,
        name: row.package.name,
        slug: row.package.slug,
      },
      book: row.book
        ? {
            id: row.book.id,
            status: row.book.status,
          }
        : null,
      trackingUrl: `/dashboard/orders/${row.id}`,
    };
  }

  private buildProgressTimeline(params: {
    stages: string[];
    currentStatus: string;
    source: Exclude<TrackingSource, "system">;
    startedAt: Date;
    updatedAt: Date;
  }): OrderTrackingResponse["timeline"] {
    const currentIndex = params.stages.indexOf(params.currentStatus);

    const timeline = params.stages.map((status, index) => {
      const state = this.resolveTrackingState(index, currentIndex);

      return {
        key: status.toLowerCase(),
        label: this.toTrackingLabel(status),
        status,
        source: params.source,
        state,
        reachedAt: this.resolveReachedAt(state, index, params.startedAt, params.updatedAt),
      };
    });

    if (currentIndex === -1) {
      timeline.push({
        key: `current_${params.currentStatus.toLowerCase()}`,
        label: this.toTrackingLabel(params.currentStatus),
        status: params.currentStatus,
        source: params.source,
        state: "current",
        reachedAt: params.updatedAt.toISOString(),
      });
    }

    return timeline;
  }

  private resolveTrackingState(index: number, currentIndex: number): TrackingState {
    if (currentIndex === -1) return "upcoming";
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "current";
    return "upcoming";
  }

  private resolveReachedAt(
    state: TrackingState,
    index: number,
    startedAt: Date,
    updatedAt: Date
  ): string | null {
    if (state === "current") return updatedAt.toISOString();
    if (state === "completed" && index === 0) return startedAt.toISOString();
    return null;
  }

  private toTrackingLabel(status: string): string {
    return status
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private normalizeStatus(value: unknown): string | null {
    const raw = this.toStringValue(value);
    if (!raw) return null;
    return raw.replace(/[\s-]+/g, "_").toUpperCase();
  }

  private toTrackingSource(value: unknown): TrackingSource | null {
    const source = this.toStringValue(value)?.toLowerCase();
    if (!source) return null;
    if (source === "order") return "order";
    if (source === "book") return "book";
    if (source === "system") return "system";
    return null;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toIsoDateTime(value: unknown): string | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    try {
      return this.toNumber(value);
    } catch {
      return null;
    }
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      if (Number.isFinite(parsed)) return parsed;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;

    throw new TypeError("Unable to serialize decimal field");
  }
}
