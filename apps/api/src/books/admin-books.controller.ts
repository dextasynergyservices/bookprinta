import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { BooksService } from "./books.service.js";
import {
  AdminBookProductionStatusResponseDto,
  BookParamsDto,
  UpdateAdminBookProductionStatusDto,
} from "./dto/book.dto.js";

@ApiTags("Admin Books")
@Controller("admin/books")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminBooksController {
  constructor(private readonly booksService: BooksService) {}

  @Patch(":id/status")
  @ApiOperation({
    summary: "Update book production tracker status",
    description:
      "Updates the admin-controlled Book.productionStatus used by the top production tracker. " +
      "This does not modify the live manuscript processing state.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Book production tracker status updated successfully",
    type: AdminBookProductionStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async updateBookProductionStatus(
    @Param() params: BookParamsDto,
    @Body() dto: UpdateAdminBookProductionStatusDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminBookProductionStatusResponseDto> {
    return this.booksService.updateAdminBookProductionStatus(params.id, dto);
  }
}
