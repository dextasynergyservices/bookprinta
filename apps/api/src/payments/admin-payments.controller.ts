import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminPaymentsListQueryDto,
  AdminPaymentsListResponseDto,
  AdminPendingBankTransfersResponseDto,
  AdminRefundPaymentDto,
  AdminRefundPaymentResponseDto,
} from "./dto/admin-payments.dto.js";
import { PaymentsService } from "./payments.service.js";

@ApiTags("Admin Payments")
@Controller("admin/payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List admin payments",
    description:
      "Returns payments for the admin payment management table with filtering, stable sorting, cursor pagination, and refund/action metadata.",
  })
  @ApiResponse({
    status: 200,
    description: "Admin payments list",
    type: AdminPaymentsListResponseDto,
  })
  async listPayments(
    @Query() query: AdminPaymentsListQueryDto
  ): Promise<AdminPaymentsListResponseDto> {
    return this.paymentsService.listAdminPayments(query);
  }

  @Get("pending-bank-transfers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List pending bank transfers",
    description:
      "Returns all bank transfer payments awaiting approval, sorted oldest first with SLA snapshot metadata for the admin dashboard.",
  })
  @ApiResponse({
    status: 200,
    description: "Pending bank transfer SLA feed",
    type: AdminPendingBankTransfersResponseDto,
  })
  async listPendingBankTransfers(): Promise<AdminPendingBankTransfersResponseDto> {
    return this.paymentsService.listAdminPendingBankTransfers();
  }

  @Post(":paymentId/approve-transfer")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve bank transfer",
    description:
      "Approves a pending bank transfer. On approval, links user/order and sends signup link email.",
  })
  @ApiResponse({ status: 200, description: "Bank transfer approved" })
  @ApiResponse({ status: 400, description: "Payment is not awaiting approval" })
  @ApiResponse({ status: 404, description: "Payment not found" })
  async approveTransfer(
    @Param("paymentId") paymentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser("sub") adminId: string
  ) {
    return this.paymentsService.approveBankTransfer({
      paymentId,
      adminId,
      adminNote: this.parseOptionalString(body.adminNote),
    });
  }

  @Post(":paymentId/reject-transfer")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reject bank transfer",
    description: "Rejects a pending bank transfer with an admin note.",
  })
  @ApiResponse({ status: 200, description: "Bank transfer rejected" })
  @ApiResponse({ status: 400, description: "Payment is not awaiting approval or note missing" })
  @ApiResponse({ status: 404, description: "Payment not found" })
  async rejectTransfer(
    @Param("paymentId") paymentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser("sub") adminId: string
  ) {
    const adminNote = this.parseRequiredString(body.adminNote, "adminNote");
    return this.paymentsService.rejectBankTransfer({
      paymentId,
      adminId,
      adminNote,
    });
  }

  @Post(":paymentId/refund")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Process an admin refund",
    description:
      "Processes a full, policy-partial, or custom refund, dispatches the provider/manual workflow, records audit logs, and sends the refund confirmation email.",
  })
  @ApiResponse({
    status: 200,
    description: "Refund processed successfully",
    type: AdminRefundPaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Refund request is invalid for the current payment/order",
  })
  @ApiResponse({ status: 404, description: "Payment not found" })
  async refundPayment(
    @Param("paymentId") paymentId: string,
    @Body() dto: AdminRefundPaymentDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminRefundPaymentResponseDto> {
    return this.paymentsService.refundAdminPayment({
      paymentId,
      adminId,
      input: dto,
    });
  }

  private parseRequiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private parseOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
}
