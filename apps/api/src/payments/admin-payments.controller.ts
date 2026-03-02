import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { PaymentsService } from "./payments.service.js";

@ApiTags("Admin Payments")
@Controller("admin/payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
