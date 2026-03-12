import { Body, Controller, Get, Header, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminOrderDetailDto,
  AdminOrdersListQueryDto,
  AdminOrdersListResponseDto,
  AdminUpdateOrderStatusDto,
  AdminUpdateOrderStatusResponseDto,
} from "./dto/admin-order.dto.js";
import { OrderParamsDto } from "./dto/order.dto.js";
import { OrdersService } from "./orders.service.js";

@ApiTags("Admin Orders")
@Controller("admin/orders")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List all orders for the admin panel",
    description:
      "Returns a cursor-paginated list of orders with filtering by status, date range, package, and free-text search.",
  })
  @ApiResponse({
    status: 200,
    description: "Admin orders list retrieved successfully",
    type: AdminOrdersListResponseDto,
  })
  async findAdminOrders(
    @Query() query: AdminOrdersListQueryDto
  ): Promise<AdminOrdersListResponseDto> {
    return this.ordersService.findAdminOrders(query);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin order detail",
    description:
      "Returns the full admin order detail payload including customer, payments, addons, timeline, and refund policy.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Admin order detail retrieved successfully",
    type: AdminOrderDetailDto,
  })
  @ApiResponse({ status: 404, description: "Order not found" })
  async findAdminOrderById(@Param() params: OrderParamsDto): Promise<AdminOrderDetailDto> {
    return this.ordersService.findAdminOrderById(params.id);
  }

  @Patch(":id/status")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Advance an order status",
    description:
      "Updates an order status using optimistic locking, records an audit log entry, and appends the order tracking timeline event.",
  })
  @ApiParam({
    name: "id",
    description: "Order CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Order status updated successfully",
    type: AdminUpdateOrderStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: "Order not found" })
  async updateAdminOrderStatus(
    @Param() params: OrderParamsDto,
    @Body() dto: AdminUpdateOrderStatusDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminUpdateOrderStatusResponseDto> {
    return this.ordersService.updateAdminOrderStatus(params.id, dto, adminId);
  }
}
