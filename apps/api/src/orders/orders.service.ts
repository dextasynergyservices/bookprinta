import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type {
  AdminArchiveOrderResponse,
  AdminOrderDetail,
  AdminOrderDisplayStatus,
  AdminOrderSortField,
  AdminOrdersListResponse,
  AdminUpdateOrderStatusResponse,
  BookStatus,
  OrderDetailResponse,
  OrderInvoiceArchiveResponse,
  OrderStatus,
  OrdersListQueryInput,
  OrdersListResponse,
  OrderTrackingResponse,
  TrackingSource,
  TrackingState,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  buildRefundPolicySnapshot,
  humanizeAdminStatus,
  resolveAdminStatusProjection,
  resolveNextAllowedOrderStatuses,
} from "./admin-order-workflow.js";
import type {
  AdminArchiveOrderDto,
  AdminOrdersListQueryDto,
  AdminUpdateOrderStatusDto,
} from "./dto/admin-order.dto.js";
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

type InvoicePdfRenderEngine = "gotenberg" | "fallback";

type InvoicePdfRenderResult = {
  buffer: Buffer;
  renderEngine: InvoicePdfRenderEngine;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private invoiceLogoSrcCache: string | null | undefined;
  private static readonly INVOICE_BRANDING_VERSION = 2;

  private static readonly ORDER_TRACKING_ENTITY_TYPE = "ORDER_TRACKING";
  private static readonly ORDER_TRACKING_ACTION = "ORDER_STATUS_REACHED";
  private static readonly ORDER_INVOICE_ENTITY_TYPE = "ORDER_INVOICE";
  private static readonly ORDER_INVOICE_ACTION = "ORDER_INVOICE_ARCHIVED";
  private static readonly ORDER_ARCHIVED_ACTION = "ORDER_ARCHIVED";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    @Optional() private readonly notificationsService?: NotificationsService
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
    userId: true,
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
        productionStatus: true,
        productionStatusUpdatedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  } as const;

  private static readonly ADMIN_ORDER_SORTABLE_FIELDS: AdminOrderSortField[] = [
    "orderNumber",
    "customerName",
    "customerEmail",
    "packageName",
    "displayStatus",
    "createdAt",
    "totalAmount",
  ];

  private static readonly ORDER_ADMIN_LIST_SELECT = {
    id: true,
    orderNumber: true,
    status: true,
    createdAt: true,
    totalAmount: true,
    currency: true,
    user: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        preferredLanguage: true,
      },
    },
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
        productionStatus: true,
      },
    },
  } as const;

  private static readonly ORDER_ADMIN_DETAIL_SELECT = {
    id: true,
    userId: true,
    orderNumber: true,
    orderType: true,
    status: true,
    version: true,
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
    refundReason: true,
    refundedAt: true,
    refundedBy: true,
    currency: true,
    trackingNumber: true,
    shippingProvider: true,
    user: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        preferredLanguage: true,
      },
    },
    package: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    shippingAddress: {
      select: {
        street: true,
        city: true,
        state: true,
        country: true,
        zipCode: true,
      },
    },
    book: {
      select: {
        id: true,
        status: true,
        productionStatus: true,
        version: true,
        rejectionReason: true,
        pageCount: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
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
        receiptUrl: true,
        payerName: true,
        payerEmail: true,
        payerPhone: true,
        adminNote: true,
        approvedAt: true,
        approvedBy: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
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

  async findUserOrders(userId: string, query: OrdersListQueryInput): Promise<OrdersListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 10;
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: OrdersService.ORDER_LIST_SELECT,
    });
    const totalItems = await this.prisma.order.count({
      where: { userId },
    });

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

  async findAdminOrders(query: AdminOrdersListQueryDto): Promise<AdminOrdersListResponse> {
    const archivedOrderIds = await this.getArchivedOrderIds();
    const where = this.buildAdminOrdersWhere(query, archivedOrderIds);
    const orderBy = this.buildAdminOrdersOrderBy(query.sortBy, query.sortDirection);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: OrdersService.ORDER_ADMIN_LIST_SELECT,
    });
    const totalItems = await this.prisma.order.count({ where });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => this.serializeAdminListItem(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems,
      limit: query.limit,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      sortableFields: [...OrdersService.ADMIN_ORDER_SORTABLE_FIELDS],
    };
  }

  async archiveAdminOrder(
    orderId: string,
    dto: AdminArchiveOrderDto,
    adminId: string
  ): Promise<AdminArchiveOrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        book: {
          select: {
            status: true,
            productionStatus: true,
          },
        },
        updatedAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    const existingArchive = await this.prisma.auditLog.findFirst({
      where: {
        entityType: "ORDER",
        entityId: orderId,
        action: OrdersService.ORDER_ARCHIVED_ACTION,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    if (existingArchive) {
      throw new BadRequestException("Order is already archived.");
    }

    const archivedAt = new Date();
    const reason = dto.reason.trim();

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: OrdersService.ORDER_ARCHIVED_ACTION,
        entityType: "ORDER",
        entityId: orderId,
        details: {
          reason,
          previousStatus: order.status,
          archivedAt: archivedAt.toISOString(),
        },
      },
    });

    return {
      id: order.id,
      status: order.status,
      archived: true,
      archivedAt: archivedAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async findAdminOrderById(orderId: string): Promise<AdminOrderDetail> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: OrdersService.ORDER_ADMIN_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    const statusProjection = resolveAdminStatusProjection({
      orderStatus: row.status,
      book: row.book
        ? {
            status: row.book.status,
            productionStatus: row.book.productionStatus,
          }
        : null,
    });
    const refundPolicy = buildRefundPolicySnapshot({
      orderTotalAmount: this.toNumber(row.totalAmount),
      orderStatus: row.status,
      book: row.book
        ? {
            status: row.book.status,
            productionStatus: row.book.productionStatus,
          }
        : null,
    });
    const tracking = await this.getOrderTrackingSnapshotOrThrow(orderId);

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      orderStatus: row.status,
      bookStatus: statusProjection.bookStatus,
      displayStatus: statusProjection.displayStatus,
      statusSource: statusProjection.statusSource,
      orderVersion: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      customer: {
        id: row.user.id,
        fullName: this.buildCustomerName(row.user.firstName, row.user.lastName, row.user.email),
        email: row.user.email,
        phoneNumber: row.user.phoneNumber ?? null,
        preferredLanguage: this.normalizePreferredLanguage(row.user.preferredLanguage),
      },
      package: {
        id: row.package.id,
        name: row.package.name,
        slug: row.package.slug,
      },
      shippingAddress: row.shippingAddress
        ? {
            street: row.shippingAddress.street,
            city: row.shippingAddress.city,
            state: row.shippingAddress.state,
            country: row.shippingAddress.country,
            zipCode: row.shippingAddress.zipCode ?? null,
          }
        : null,
      book: row.book
        ? {
            id: row.book.id,
            status: row.book.status,
            productionStatus: row.book.productionStatus ?? null,
            version: row.book.version,
            rejectionReason: row.book.rejectionReason ?? null,
            pageCount: row.book.pageCount ?? null,
            wordCount: row.book.wordCount ?? null,
            createdAt: row.book.createdAt.toISOString(),
            updatedAt: row.book.updatedAt.toISOString(),
          }
        : null,
      copies: row.copies,
      bookSize: row.bookSize,
      paperColor: row.paperColor,
      lamination: row.lamination,
      initialAmount: this.toNumber(row.initialAmount),
      extraAmount: this.toNumber(row.extraAmount),
      discountAmount: this.toNumber(row.discountAmount),
      totalAmount: this.toNumber(row.totalAmount),
      refundAmount: this.toNumber(row.refundAmount),
      refundReason: row.refundReason ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      refundedBy: row.refundedBy ?? null,
      currency: row.currency,
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
        receiptUrl: payment.receiptUrl ?? null,
        payerName: payment.payerName ?? null,
        payerEmail: payment.payerEmail ?? null,
        payerPhone: payment.payerPhone ?? null,
        adminNote: payment.adminNote ?? null,
        approvedAt: payment.approvedAt?.toISOString() ?? null,
        approvedBy: payment.approvedBy ?? null,
        processedAt: payment.processedAt?.toISOString() ?? null,
        isRefundable: this.isAdminPaymentRefundable({
          provider: payment.provider,
          status: payment.status,
          type: payment.type,
          amount: this.toNumber(payment.amount),
          refundPolicy,
        }),
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
      })),
      timeline: tracking.timeline,
      refundPolicy,
      statusControl: {
        currentStatus: row.status,
        expectedVersion: row.version,
        nextAllowedStatuses: resolveNextAllowedOrderStatuses(row.status),
      },
    };
  }

  async updateAdminOrderStatus(
    orderId: string,
    dto: AdminUpdateOrderStatusDto,
    adminId: string
  ): Promise<AdminUpdateOrderStatusResponse> {
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        version: true,
        book: {
          select: {
            status: true,
            productionStatus: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    if (current.version !== dto.expectedVersion) {
      throw new ConflictException("Order was updated by another admin. Refresh and try again.");
    }

    if (current.status === dto.nextStatus) {
      throw new BadRequestException("Order is already in that status.");
    }

    const nextAllowedStatuses = resolveNextAllowedOrderStatuses(current.status);
    if (!nextAllowedStatuses.includes(dto.nextStatus)) {
      throw new BadRequestException(
        `Cannot transition order from ${current.status} to ${dto.nextStatus}.`
      );
    }

    const reason = dto.reason?.trim() || null;
    const note = dto.note?.trim() || null;
    const recordedAt = new Date();

    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.order.updateMany({
        where: {
          id: current.id,
          version: dto.expectedVersion,
        },
        data: {
          status: dto.nextStatus,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Order was updated by another admin. Refresh and try again.");
      }

      const updatedOrder = await tx.order.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          userId: true,
          orderNumber: true,
          status: true,
          version: true,
          updatedAt: true,
          book: {
            select: {
              status: true,
              productionStatus: true,
            },
          },
        },
      });

      if (!updatedOrder) {
        throw new NotFoundException(`Order "${orderId}" not found`);
      }

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_ORDER_STATUS_UPDATED",
          entityType: "ORDER",
          entityId: current.id,
          details: {
            previousStatus: current.status,
            nextStatus: dto.nextStatus,
            note,
            reason,
            expectedVersion: dto.expectedVersion,
            orderVersion: updatedOrder.version,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: OrdersService.ORDER_TRACKING_ACTION,
          entityType: OrdersService.ORDER_TRACKING_ENTITY_TYPE,
          entityId: current.id,
          details: {
            source: "order",
            status: dto.nextStatus,
            reachedAt: recordedAt.toISOString(),
            label: humanizeAdminStatus(dto.nextStatus),
          },
        },
      });

      await this.notificationsService?.createOrderStatusNotification(
        {
          userId: updatedOrder.userId,
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: dto.nextStatus,
          source: "order",
        },
        tx
      );

      return {
        updated: updatedOrder,
        audit: auditLog,
      };
    });

    const statusProjection = resolveAdminStatusProjection({
      orderStatus: updated.status,
      book: updated.book
        ? {
            status: updated.book.status,
            productionStatus: updated.book.productionStatus,
          }
        : null,
    });

    return {
      orderId: updated.id,
      previousStatus: current.status,
      nextStatus: updated.status,
      displayStatus: statusProjection.displayStatus,
      statusSource: statusProjection.statusSource,
      orderVersion: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
      audit: this.serializeAdminAuditEntry(audit, adminId),
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

    return this.buildOrderTrackingResponse(row);
  }

  async getUserOrderInvoiceArchive(
    userId: string,
    orderId: string
  ): Promise<OrderInvoiceArchiveResponse> {
    const order = await this.getOrderForInvoiceOrThrow(userId, orderId);
    const existingArchive = await this.readLatestInvoiceArchive(order.id);
    if (existingArchive && !this.shouldRefreshInvoiceArchive(existingArchive)) {
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

    if (existingArchive && !this.shouldRefreshInvoiceArchive(existingArchive)) {
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
      logoSrc: await this.resolveInvoiceLogoSrc(),
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

    const renderedInvoicePdf = await this.renderInvoicePdf(invoiceHtml, {
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
    const pdfBuffer = renderedInvoicePdf.buffer;
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
      brandingVersion: OrdersService.INVOICE_BRANDING_VERSION,
      renderEngine: renderedInvoicePdf.renderEngine,
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
  ): Promise<InvoicePdfRenderResult> {
    const gotenbergBaseUrls = this.buildGotenbergBaseUrls();
    if (gotenbergBaseUrls.length === 0) {
      this.logger.warn("Gotenberg is not configured. Using plain invoice fallback renderer.");
      return {
        buffer: this.renderFallbackInvoicePdf(fallbackInput),
        renderEngine: "fallback",
      };
    }

    const headerVariants = this.buildGotenbergHeaderVariants();
    const maxAttemptsPerEndpoint = 3;

    for (const gotenbergBaseUrl of gotenbergBaseUrls) {
      for (const headers of headerVariants) {
        const hasAuthHeader = typeof headers.Authorization === "string";

        for (let attempt = 1; attempt <= maxAttemptsPerEndpoint; attempt += 1) {
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
              headers,
            });
          } catch (error) {
            this.logger.error(
              `Gotenberg request failed on attempt ${attempt}/${maxAttemptsPerEndpoint} via ${gotenbergBaseUrl}`,
              error
            );
          } finally {
            clearTimeout(timeout);
          }

          if (response?.ok) {
            const pdfArrayBuffer = await response.arrayBuffer();
            return {
              buffer: Buffer.from(pdfArrayBuffer),
              renderEngine: "gotenberg",
            };
          }

          if (response && hasAuthHeader && (response.status === 401 || response.status === 403)) {
            this.logger.warn(
              `Gotenberg rejected configured basic auth via ${gotenbergBaseUrl}; retrying without auth headers.`
            );
            break;
          }

          if (response) {
            const bodySnippet = await response
              .text()
              .then((value) => value.slice(0, 400))
              .catch(() => "");
            this.logger.error(
              `Gotenberg returned ${response.status} on attempt ${attempt}/${maxAttemptsPerEndpoint} via ${gotenbergBaseUrl} while generating invoice PDF. ${bodySnippet}`
            );
          }

          if (attempt < maxAttemptsPerEndpoint) {
            await this.delay(400 * attempt);
          }
        }
      }
    }

    this.logger.warn(
      "Falling back to internal invoice PDF renderer after primary/backup Gotenberg retries failed."
    );
    return {
      buffer: this.renderFallbackInvoicePdf(fallbackInput),
      renderEngine: "fallback",
    };
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

  private shouldRefreshInvoiceArchive(archive: OrderInvoiceArchiveResponse): boolean {
    if (archive.brandingVersion !== OrdersService.INVOICE_BRANDING_VERSION) {
      return true;
    }

    const gotenbergConfigured = this.buildGotenbergBaseUrls().length > 0;
    if (!gotenbergConfigured) {
      return false;
    }

    return archive.renderEngine !== "gotenberg";
  }

  private async resolveInvoiceLogoSrc(): Promise<string | null> {
    if (this.invoiceLogoSrcCache !== undefined) {
      return this.invoiceLogoSrcCache;
    }

    const fromDataUrl = process.env.BOOKPRINTA_INVOICE_LOGO_DATA_URL?.trim();
    if (fromDataUrl) {
      this.invoiceLogoSrcCache = fromDataUrl;
      return this.invoiceLogoSrcCache;
    }

    const fromUrl = process.env.BOOKPRINTA_INVOICE_LOGO_URL?.trim();
    if (fromUrl) {
      this.invoiceLogoSrcCache = fromUrl;
      return this.invoiceLogoSrcCache;
    }

    const candidates = [
      resolve(process.cwd(), "../web/public/logo-blue.png"),
      resolve(process.cwd(), "apps/web/public/logo-blue.png"),
      resolve(process.cwd(), "public/logo-blue.png"),
      resolve(process.cwd(), "../web/public/logo-main-black.png"),
      resolve(process.cwd(), "apps/web/public/logo-main-black.png"),
      resolve(process.cwd(), "public/logo-main-black.png"),
    ];

    for (const candidate of candidates) {
      try {
        const bytes = await readFile(candidate);
        const ext = extname(candidate).toLowerCase();
        const mime =
          ext === ".svg"
            ? "image/svg+xml"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : "image/png";
        this.invoiceLogoSrcCache = `data:${mime};base64,${bytes.toString("base64")}`;
        return this.invoiceLogoSrcCache;
      } catch {}
    }

    this.logger.warn(
      "Invoice logo file not found. Set BOOKPRINTA_INVOICE_LOGO_URL or BOOKPRINTA_INVOICE_LOGO_DATA_URL to configure branding."
    );
    this.invoiceLogoSrcCache = null;
    return null;
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

  private buildGotenbergBaseUrls(): string[] {
    const primary = (process.env.GOTENBERG_URL ?? "").trim().replace(/\/+$/, "");
    const backup = (process.env.GOTENBERG_BACKUP_URL ?? "").trim().replace(/\/+$/, "");

    return [primary, backup].filter(
      (url, index, all) => Boolean(url) && all.indexOf(url) === index
    );
  }

  private buildGotenbergHeaderVariants(): Array<Record<string, string>> {
    const authHeaders = this.buildGotenbergAuthHeaders();
    if (Object.keys(authHeaders).length === 0) {
      return [{}];
    }

    // Local Gotenberg typically runs without auth; retrying without headers prevents false fallbacks.
    return [authHeaders, {}];
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
          status: this.resolveProductionStatus({
            productionStatus: row.book.productionStatus,
            manuscriptStatus: row.book.status,
          }),
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
        status: this.resolveProductionStatus({
          productionStatus: row.book.productionStatus,
          manuscriptStatus: row.book.status,
        }),
        reachedAt: row.book.productionStatusUpdatedAt ?? row.book.createdAt,
      });
    }
  }

  private async getOrderTrackingSnapshotOrThrow(orderId: string): Promise<OrderTrackingResponse> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: OrdersService.ORDER_TRACKING_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    return this.buildOrderTrackingResponse(row);
  }

  private async buildOrderTrackingResponse(
    row: Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_TRACKING_SELECT }>
  ): Promise<OrderTrackingResponse> {
    await this.ensureTrackingEventsForOrder(row, row.userId);
    const persistedEvents = await this.readTrackingEvents(row.id);

    const book = row.book;
    const shouldUseOrderSource = this.issueOrderStatuses.has(row.status) || !book;
    const productionBookStatus = book
      ? this.resolveProductionStatus({
          productionStatus: book.productionStatus,
          manuscriptStatus: book.status,
        })
      : null;
    const timeline = shouldUseOrderSource
      ? persistedEvents.length > 0
        ? this.toTrackingTimelineFromEvents({
            events: persistedEvents,
            shouldUseOrderSource,
            currentOrderStatus: row.status,
            currentBookStatus: productionBookStatus,
          })
        : this.buildProgressTimeline({
            stages: this.orderTrackingStages,
            currentStatus: row.status,
            source: "order",
            startedAt: row.createdAt,
            updatedAt: row.updatedAt,
          })
      : this.buildProgressTimeline({
          stages: this.bookTrackingStages,
          currentStatus: productionBookStatus ?? "PAYMENT_RECEIVED",
          source: "book",
          startedAt: book.createdAt,
          updatedAt: book.productionStatusUpdatedAt ?? book.createdAt,
        });

    const latestEventReachedAt = timeline[timeline.length - 1]?.reachedAt ?? null;
    const currentUpdatedAt = shouldUseOrderSource
      ? row.updatedAt.toISOString()
      : (row.book?.productionStatusUpdatedAt ?? row.book?.createdAt ?? row.updatedAt).toISOString();

    return {
      orderId: row.id,
      orderNumber: row.orderNumber,
      bookId: row.book?.id ?? null,
      currentOrderStatus: row.status,
      currentBookStatus: productionBookStatus,
      rejectionReason: row.book?.rejectionReason ?? null,
      trackingNumber: row.trackingNumber ?? null,
      shippingProvider: row.shippingProvider ?? null,
      updatedAt: latestEventReachedAt ?? currentUpdatedAt,
      timeline,
    };
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
    const brandingVersion = this.toNumberOrNull(details.brandingVersion);
    const renderEngine = this.toInvoiceRenderEngine(details.renderEngine);
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
      ...(brandingVersion !== null && Number.isInteger(brandingVersion) && brandingVersion > 0
        ? { brandingVersion }
        : {}),
      ...(renderEngine ? { renderEngine } : {}),
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

  private buildAdminOrdersWhere(
    query: AdminOrdersListQueryDto,
    archivedOrderIds: string[]
  ): Prisma.OrderWhereInput {
    const q = query.q?.trim();
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          }
        : undefined;
    const filters: Prisma.OrderWhereInput[] = [];

    if (archivedOrderIds.length > 0) {
      filters.push({
        id: {
          notIn: archivedOrderIds,
        },
      });
    }

    if (query.packageId) {
      filters.push({ packageId: query.packageId });
    }

    if (createdAt) {
      filters.push({ createdAt });
    }

    if (query.status) {
      filters.push(this.buildAdminOrderStatusWhere(query.status));
    }

    if (q) {
      filters.push({
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { user: { is: { firstName: { contains: q, mode: "insensitive" } } } },
          { user: { is: { lastName: { contains: q, mode: "insensitive" } } } },
          { user: { is: { email: { contains: q, mode: "insensitive" } } } },
          { package: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }

    if (filters.length === 0) {
      return {};
    }

    if (filters.length === 1) {
      return filters[0] ?? {};
    }

    return {
      AND: filters,
    };
  }

  private buildAdminOrderStatusWhere(status: AdminOrderDisplayStatus): Prisma.OrderWhereInput {
    const filters: Prisma.OrderWhereInput[] = [];

    if (this.isOrderLifecycleStatus(status)) {
      filters.push({ status });
    }

    if (this.isBookLifecycleStatus(status)) {
      filters.push({ book: { is: { productionStatus: status } } });
      filters.push({ book: { is: { status } } });
    }

    return filters.length === 1 ? filters[0] : { OR: filters };
  }

  private buildAdminOrdersOrderBy(
    sortBy: AdminOrderSortField,
    sortDirection: "asc" | "desc"
  ): Prisma.OrderOrderByWithRelationInput[] {
    const direction = sortDirection;

    switch (sortBy) {
      case "orderNumber":
        return [{ orderNumber: direction }, { id: direction }];
      case "customerName":
        return [
          { user: { firstName: direction } },
          { user: { lastName: direction } },
          { id: direction },
        ];
      case "customerEmail":
        return [{ user: { email: direction } }, { id: direction }];
      case "packageName":
        return [{ package: { name: direction } }, { id: direction }];
      case "displayStatus":
        return [
          { book: { productionStatus: direction } },
          { book: { status: direction } },
          { status: direction },
          { id: direction },
        ];
      case "totalAmount":
        return [{ totalAmount: direction }, { id: direction }];
      default:
        return [{ createdAt: direction }, { id: direction }];
    }
  }

  private serializeAdminListItem(
    row: Prisma.OrderGetPayload<{ select: typeof OrdersService.ORDER_ADMIN_LIST_SELECT }>
  ): AdminOrdersListResponse["items"][number] {
    const statusProjection = resolveAdminStatusProjection({
      orderStatus: row.status,
      book: row.book
        ? {
            status: row.book.status,
            productionStatus: row.book.productionStatus,
          }
        : null,
    });

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customer: {
        id: row.user.id,
        fullName: this.buildCustomerName(row.user.firstName, row.user.lastName, row.user.email),
        email: row.user.email,
        phoneNumber: row.user.phoneNumber ?? null,
        preferredLanguage: this.normalizePreferredLanguage(row.user.preferredLanguage),
      },
      package: {
        id: row.package.id,
        name: row.package.name,
        slug: row.package.slug,
      },
      orderStatus: row.status,
      bookStatus: statusProjection.bookStatus,
      displayStatus: statusProjection.displayStatus,
      statusSource: statusProjection.statusSource,
      createdAt: row.createdAt.toISOString(),
      totalAmount: this.toNumber(row.totalAmount),
      currency: row.currency,
      detailUrl: `/admin/orders/${row.id}`,
      actions: {
        canArchive: this.isOrderArchivable(statusProjection.displayStatus),
      },
    };
  }

  private async getArchivedOrderIds(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: "ORDER",
        action: OrdersService.ORDER_ARCHIVED_ACTION,
      },
      select: {
        entityId: true,
      },
      distinct: ["entityId"],
    });

    return rows.map((row) => row.entityId);
  }

  private isOrderArchivable(_status: AdminOrderDisplayStatus): boolean {
    return true;
  }

  private isAdminPaymentRefundable(params: {
    provider: string;
    status: string;
    type: string;
    amount: number;
    refundPolicy: AdminOrderDetail["refundPolicy"];
  }): boolean {
    if (!params.refundPolicy.eligible) return false;
    if (params.status !== "SUCCESS") return false;
    if (params.type === "REFUND") return false;
    if (params.amount <= 0) return false;
    return (
      params.provider === "PAYSTACK" ||
      params.provider === "STRIPE" ||
      params.provider === "BANK_TRANSFER"
    );
  }

  private buildCustomerName(
    firstName: string | null,
    lastName: string | null,
    email: string
  ): string {
    const parts = [firstName?.trim(), lastName?.trim()].filter((value): value is string =>
      Boolean(value && value.length > 0)
    );
    return parts.join(" ") || email;
  }

  private normalizePreferredLanguage(value: string | null): string {
    const normalized = value?.trim().toLowerCase();
    return normalized && normalized.length >= 2 ? normalized : "en";
  }

  private isOrderLifecycleStatus(status: AdminOrderDisplayStatus): status is OrderStatus {
    return (
      status === "PENDING_PAYMENT" ||
      status === "PENDING_PAYMENT_APPROVAL" ||
      status === "PAID" ||
      status === "PROCESSING" ||
      status === "AWAITING_UPLOAD" ||
      status === "FORMATTING" ||
      status === "ACTION_REQUIRED" ||
      status === "PREVIEW_READY" ||
      status === "PENDING_EXTRA_PAYMENT" ||
      status === "APPROVED" ||
      status === "IN_PRODUCTION" ||
      status === "COMPLETED" ||
      status === "CANCELLED" ||
      status === "REFUNDED"
    );
  }

  private isBookLifecycleStatus(status: AdminOrderDisplayStatus): status is BookStatus {
    return (
      status === "AWAITING_UPLOAD" ||
      status === "UPLOADED" ||
      status === "PAYMENT_RECEIVED" ||
      status === "AI_PROCESSING" ||
      status === "DESIGNING" ||
      status === "DESIGNED" ||
      status === "FORMATTING" ||
      status === "FORMATTED" ||
      status === "FORMATTING_REVIEW" ||
      status === "PREVIEW_READY" ||
      status === "REVIEW" ||
      status === "APPROVED" ||
      status === "REJECTED" ||
      status === "IN_PRODUCTION" ||
      status === "PRINTING" ||
      status === "PRINTED" ||
      status === "SHIPPING" ||
      status === "DELIVERED" ||
      status === "COMPLETED" ||
      status === "CANCELLED"
    );
  }

  private serializeAdminAuditEntry(
    row: Pick<
      Prisma.AuditLogGetPayload<object>,
      "id" | "action" | "entityType" | "entityId" | "details" | "createdAt"
    >,
    recordedBy: string
  ): AdminUpdateOrderStatusResponse["audit"] {
    const details = this.toRecord(row.details);
    return {
      auditId: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      recordedAt: row.createdAt.toISOString(),
      recordedBy,
      note: this.toStringValue(details?.note) ?? null,
      reason: this.toStringValue(details?.reason) ?? null,
    };
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

  private resolveProductionStatus(params: {
    productionStatus: BookStatus | null;
    manuscriptStatus: BookStatus;
  }): BookStatus {
    return params.productionStatus ?? "PAYMENT_RECEIVED";
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

  private toInvoiceRenderEngine(
    value: unknown
  ): OrderInvoiceArchiveResponse["renderEngine"] | null {
    const engine = this.toStringValue(value)?.toLowerCase();
    if (!engine) return null;
    if (engine === "gotenberg") return "gotenberg";
    if (engine === "fallback") return "fallback";
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
