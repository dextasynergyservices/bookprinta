import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import {
  OrderDetailResponseDto,
  OrderInvoiceArchiveResponseDto,
  OrderParamsDto,
  OrdersListQueryDto,
  OrdersListResponseDto,
  OrderTrackingResponseDto,
} from "./dto/order.dto.js";
import { OrdersService } from "./orders.service.js";

@ApiTags("Orders")
@Controller("orders")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /api/v1/orders
   * Authenticated user's orders, paginated and newest-first.
   */
  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List current user's orders",
    description:
      "Returns the authenticated user's orders (paginated, newest first). " +
      "Each item includes package, order status, optional book status, and total paid.",
  })
  @ApiResponse({
    status: 200,
    description: "Order list retrieved successfully",
    type: OrdersListResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async findMyOrders(
    @CurrentUser("sub") userId: string,
    @Query() query: OrdersListQueryDto
  ): Promise<OrdersListResponseDto> {
    return this.ordersService.findUserOrders(userId, query);
  }

  /**
   * GET /api/v1/orders/:id
   * Authenticated user can only access their own order.
   */
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get order detail",
    description:
      "Returns full order detail for the authenticated user, including package, payment history, " +
      "book status, print options, and selected addons.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Order detail retrieved successfully",
    type: OrderDetailResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async findMyOrderById(
    @CurrentUser("sub") userId: string,
    @Param() params: OrderParamsDto
  ): Promise<OrderDetailResponseDto> {
    return this.ordersService.findUserOrderById(userId, params.id);
  }

  /**
   * GET /api/v1/orders/:id/tracking
   * Tracking timeline is synthesized from current lifecycle status
   * (until historical status events are persisted).
   */
  @Get(":id/tracking")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get order tracking timeline",
    description:
      "Returns the authenticated user's tracking timeline for an order. " +
      "Timeline stages are derived from current order/book lifecycle state, " +
      "including bookId and rejectionReason for dashboard progress tracking.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Order tracking retrieved successfully",
    type: OrderTrackingResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async getMyOrderTracking(
    @CurrentUser("sub") userId: string,
    @Param() params: OrderParamsDto
  ): Promise<OrderTrackingResponseDto> {
    return this.ordersService.getUserOrderTracking(userId, params.id);
  }

  /**
   * GET /api/v1/orders/:id/invoice
   * Streams archived invoice PDF (generates + archives if missing).
   */
  @Get(":id/invoice")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Download order invoice PDF",
    description:
      "Generates and archives a professional invoice PDF for the authenticated user's order, " +
      "then streams the archived PDF as an attachment.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiProduces("application/pdf")
  @ApiOkResponse({
    description: "Invoice PDF stream",
    schema: {
      type: "string",
      format: "binary",
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async downloadMyOrderInvoice(
    @CurrentUser("sub") userId: string,
    @Param() params: OrderParamsDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const invoice = await this.ordersService.downloadUserOrderInvoice(userId, params.id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${invoice.fileName}"`);
    return new StreamableFile(invoice.buffer);
  }

  /**
   * GET /api/v1/orders/:id/invoice/archive
   * Returns latest archived invoice metadata.
   */
  @Get(":id/invoice/archive")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get archived invoice metadata",
    description:
      "Returns metadata for the latest archived invoice. " +
      "If no archive exists yet, an invoice is generated and archived first.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Archived invoice metadata",
    type: OrderInvoiceArchiveResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async getMyOrderInvoiceArchive(
    @CurrentUser("sub") userId: string,
    @Param() params: OrderParamsDto
  ): Promise<OrderInvoiceArchiveResponseDto> {
    return this.ordersService.getUserOrderInvoiceArchive(userId, params.id);
  }
}
