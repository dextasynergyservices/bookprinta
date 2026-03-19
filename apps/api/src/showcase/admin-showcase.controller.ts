import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { AdminShowcaseService } from "./admin-showcase.service.js";
import { AdminShowcaseUploadService } from "./admin-showcase-upload.service.js";
import {
  AdminAuthorizeShowcaseCoverUploadResponseDto,
  AdminCreateShowcaseEntryDto,
  AdminDeleteShowcaseEntryResponseDto,
  AdminFinalizeShowcaseCoverUploadResponseDto,
  AdminShowcaseCoverUploadBodyDto,
  AdminShowcaseCoverUploadResponseDto,
  AdminShowcaseEntriesListQueryDto,
  AdminShowcaseEntriesListResponseDto,
  AdminShowcaseEntryDto,
  AdminShowcaseUserSearchQueryDto,
  AdminShowcaseUserSearchResponseDto,
  AdminUpdateShowcaseEntryDto,
} from "./dto/index.js";

@ApiTags("Admin Showcase")
@Controller("admin/showcase")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.EDITOR)
@ApiBearerAuth("access-token")
export class AdminShowcaseController {
  constructor(
    private readonly adminShowcaseService: AdminShowcaseService,
    private readonly adminShowcaseUploadService: AdminShowcaseUploadService
  ) {}

  @Post("cover-upload")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Authorize or finalize a showcase cover upload (admin)",
    description:
      'Send { action: "authorize", fileName, fileSize, mimeType } to get signed Cloudinary upload params, then send { action: "finalize", secureUrl, publicId, entryId? } after upload succeeds.',
  })
  @ApiResponse({
    status: 200,
    description: "Authorize/finalize showcase cover upload response",
    type: AdminShowcaseCoverUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or invalid upload metadata" })
  @ApiResponse({ status: 404, description: "Showcase entry not found" })
  @ApiResponse({ status: 503, description: "Cloudinary upload service unavailable" })
  async uploadCover(
    @Body() body: AdminShowcaseCoverUploadBodyDto,
    @CurrentUser("sub") adminId: string
  ): Promise<
    | AdminShowcaseCoverUploadResponseDto
    | AdminAuthorizeShowcaseCoverUploadResponseDto
    | AdminFinalizeShowcaseCoverUploadResponseDto
  > {
    return this.adminShowcaseUploadService.requestAdminShowcaseCoverUpload(body, adminId);
  }

  @Get("users/search")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Search internal users for showcase linking (admin)",
    description:
      "Returns a minimal cursor-paginated user payload for searchable dropdowns used in showcase entry forms.",
  })
  @ApiQuery({ name: "q", required: false, description: "Search by name or email" })
  @ApiQuery({ name: "cursor", required: false, description: "Pagination cursor" })
  @ApiQuery({ name: "limit", required: false, description: "Page size (default 10, max 30)" })
  @ApiResponse({
    status: 200,
    description: "Showcase-linkable users retrieved",
    type: AdminShowcaseUserSearchResponseDto,
  })
  async searchUsers(
    @Query() query: AdminShowcaseUserSearchQueryDto
  ): Promise<AdminShowcaseUserSearchResponseDto> {
    return this.adminShowcaseService.searchAdminShowcaseUsers(query);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List showcase entries (admin)",
    description: "Returns showcase entries with cursor pagination and optional filters.",
  })
  @ApiQuery({ name: "cursor", required: false, description: "Pagination cursor" })
  @ApiQuery({ name: "limit", required: false, description: "Page size (default 20, max 50)" })
  @ApiQuery({ name: "q", required: false, description: "Search by author name or book title" })
  @ApiQuery({ name: "categoryId", required: false, description: "Filter by showcase category ID" })
  @ApiQuery({
    name: "isFeatured",
    required: false,
    description: "Filter by featured state",
    schema: { oneOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }] },
  })
  @ApiQuery({
    name: "sort",
    required: false,
    enum: [
      "sort_order_asc",
      "sort_order_desc",
      "published_at_desc",
      "published_at_asc",
      "created_at_desc",
      "created_at_asc",
    ],
    description: "Sort mode for the admin showcase list",
  })
  @ApiResponse({
    status: 200,
    description: "Showcase entries retrieved",
    type: AdminShowcaseEntriesListResponseDto,
  })
  async list(
    @Query() query: AdminShowcaseEntriesListQueryDto
  ): Promise<AdminShowcaseEntriesListResponseDto> {
    return this.adminShowcaseService.listAdminShowcaseEntries(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create showcase entry (admin)",
    description: "Creates a curated showcase entry for the public showcase page.",
  })
  @ApiResponse({
    status: 201,
    description: "Showcase entry created",
    type: AdminShowcaseEntryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or invalid relation reference" })
  async create(
    @Body() body: AdminCreateShowcaseEntryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminShowcaseEntryDto> {
    return this.adminShowcaseService.createAdminShowcaseEntry(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update showcase entry (admin)",
    description: "Updates showcase entry fields including featured state and sort order.",
  })
  @ApiParam({ name: "id", description: "Showcase entry ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Showcase entry updated",
    type: AdminShowcaseEntryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or invalid relation reference" })
  @ApiResponse({ status: 404, description: "Showcase entry not found" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateShowcaseEntryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminShowcaseEntryDto> {
    return this.adminShowcaseService.updateAdminShowcaseEntry(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete showcase entry (admin)",
    description: "Permanently deletes a curated showcase entry.",
  })
  @ApiParam({ name: "id", description: "Showcase entry ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Showcase entry deleted",
    type: AdminDeleteShowcaseEntryResponseDto,
  })
  @ApiResponse({ status: 404, description: "Showcase entry not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeleteShowcaseEntryResponseDto> {
    return this.adminShowcaseService.deleteAdminShowcaseEntry(id);
  }
}
