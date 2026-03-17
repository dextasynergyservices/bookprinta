import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminArchiveQuoteDto,
  AdminDeleteQuoteDto,
  AdminDeleteQuoteResponseDto,
  AdminQuoteActionResponseDto,
  AdminQuoteDetailDto,
  AdminQuoteParamsDto,
  AdminQuotePatchDto,
  AdminQuotePatchResponseDto,
  AdminQuotesListQueryDto,
  AdminQuotesListResponseDto,
  AdminRejectQuoteDto,
  AdminRevokeQuotePaymentLinkDto,
  GenerateQuotePaymentLinkDto,
  GenerateQuotePaymentLinkResponseDto,
  RevokeQuotePaymentLinkResponseDto,
} from "./dto/admin-quote.dto.js";
import { QuotesService } from "./quotes.service.js";

@ApiTags("Admin Quotes")
@Controller("admin/quotes")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List custom quote requests for admin panel",
    description:
      "Returns a cursor-paginated list of custom quotes with filtering by status and free-text search.",
  })
  @ApiResponse({
    status: 200,
    description: "Admin quotes list retrieved successfully",
    type: AdminQuotesListResponseDto,
  })
  async findAdminQuotes(
    @Query() query: AdminQuotesListQueryDto
  ): Promise<AdminQuotesListResponseDto> {
    return this.quotesService.findAdminQuotes(query);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin custom quote detail",
    description:
      "Returns all submitted custom quote data (wizard steps), estimate/manual pricing summary, admin notes, and payment-link metadata.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Admin quote detail retrieved successfully",
    type: AdminQuoteDetailDto,
  })
  @ApiResponse({ status: 404, description: "Quote not found" })
  async findAdminQuoteById(@Param() params: AdminQuoteParamsDto): Promise<AdminQuoteDetailDto> {
    return this.quotesService.findAdminQuoteById(params.id);
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update custom quote notes or final price",
    description:
      "Persists admin notes and/or final price for a custom quote. Intended for autosave-on-blur note updates.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Custom quote updated successfully",
    type: AdminQuotePatchResponseDto,
  })
  @ApiResponse({ status: 404, description: "Quote not found" })
  async updateAdminQuote(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: AdminQuotePatchDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminQuotePatchResponseDto> {
    return this.quotesService.updateAdminQuote(params.id, dto, adminId);
  }

  @Post(":id/payment-link")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Generate custom quote payment link",
    description:
      "Generates a unique payment link token with 7-day expiry, persists final price, and transitions quote status to PAYMENT_LINK_SENT.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 201,
    description: "Payment link generated successfully",
    type: GenerateQuotePaymentLinkResponseDto,
  })
  @ApiResponse({ status: 404, description: "Quote not found" })
  async generatePaymentLink(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: GenerateQuotePaymentLinkDto,
    @CurrentUser("sub") adminId: string
  ): Promise<GenerateQuotePaymentLinkResponseDto> {
    return this.quotesService.generatePaymentLink(params.id, dto, adminId);
  }

  @Delete(":id/payment-link")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Revoke custom quote payment link",
    description: "Revokes an existing payment link by clearing token, URL, and expiry metadata.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Payment link revoked successfully",
    type: RevokeQuotePaymentLinkResponseDto,
  })
  @ApiResponse({ status: 404, description: "Quote not found" })
  async revokePaymentLink(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: AdminRevokeQuotePaymentLinkDto,
    @CurrentUser("sub") adminId: string
  ): Promise<RevokeQuotePaymentLinkResponseDto> {
    return this.quotesService.revokePaymentLink(params.id, dto, adminId);
  }

  @Patch(":id/reject")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Reject a custom quote",
    description: "Sets quote status to REJECTED and records the rejection reason in audit logs.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Quote rejected successfully",
    type: AdminQuoteActionResponseDto,
  })
  async rejectQuote(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: AdminRejectQuoteDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminQuoteActionResponseDto> {
    return this.quotesService.rejectQuote(params.id, dto, adminId);
  }

  @Patch(":id/archive")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Archive a custom quote",
    description: "Archives a quote from active admin queue and records the reason in audit logs.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Quote archived successfully",
    type: AdminQuoteActionResponseDto,
  })
  async archiveQuote(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: AdminArchiveQuoteDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminQuoteActionResponseDto> {
    return this.quotesService.archiveQuote(params.id, dto, adminId);
  }

  @Delete(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Soft-delete a custom quote",
    description:
      "Soft-deletes a quote only when status is PENDING/REJECTED and no order has been created; requires typed DELETE confirmation and reason.",
  })
  @ApiParam({
    name: "id",
    description: "Custom quote CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Quote soft-deleted successfully",
    type: AdminDeleteQuoteResponseDto,
  })
  async deleteQuote(
    @Param() params: AdminQuoteParamsDto,
    @Body() dto: AdminDeleteQuoteDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminDeleteQuoteResponseDto> {
    return this.quotesService.deleteQuote(params.id, dto, adminId);
  }
}
