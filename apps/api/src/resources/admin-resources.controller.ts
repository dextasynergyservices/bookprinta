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
import {
  AdminCreateResourceDto,
  AdminDeleteResourceResponseDto,
  AdminResourceDetailDto,
  AdminResourceSlugAvailabilityQueryDto,
  AdminResourceSlugAvailabilityResponseDto,
  AdminResourcesListQueryDto,
  AdminResourcesListResponseDto,
  AdminUpdateResourceDto,
  RequestAdminResourceCoverUploadBodyDto,
  RequestAdminResourceCoverUploadResponseDto,
} from "./dto/index.js";
import { ResourcesService } from "./resources.service.js";

@ApiTags("Admin Resources")
@Controller("admin/resources")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.EDITOR)
@ApiBearerAuth("access-token")
export class AdminResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List resources (admin)",
    description:
      "Returns all resources, including unpublished, with cursor pagination and optional filters.",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "Pagination cursor (last seen resource ID)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Page size (default 20, max 50)",
    example: 20,
  })
  @ApiQuery({ name: "q", required: false, description: "Search by title, slug, or excerpt" })
  @ApiQuery({ name: "categoryId", required: false, description: "Filter by category ID" })
  @ApiQuery({
    name: "isPublished",
    required: false,
    description: "Filter by publication state",
    schema: { oneOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }] },
  })
  @ApiResponse({
    status: 200,
    description: "Admin resource list",
    type: AdminResourcesListResponseDto,
  })
  async list(@Query() query: AdminResourcesListQueryDto): Promise<AdminResourcesListResponseDto> {
    return this.resourcesService.listAdminResources(query);
  }

  @Get("slug-availability")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Check resource slug availability (admin)",
    description:
      "Checks whether a slug is available for use. Pass excludeId when editing an existing resource.",
  })
  @ApiQuery({
    name: "slug",
    required: true,
    description: "Slug to validate",
    example: "how-to-format-your-manuscript",
  })
  @ApiQuery({
    name: "excludeId",
    required: false,
    description: "Existing resource ID to exclude from uniqueness checks",
  })
  @ApiResponse({
    status: 200,
    description: "Slug availability result",
    type: AdminResourceSlugAvailabilityResponseDto,
  })
  async checkSlugAvailability(
    @Query() query: AdminResourceSlugAvailabilityQueryDto
  ): Promise<AdminResourceSlugAvailabilityResponseDto> {
    return this.resourcesService.checkAdminResourceSlugAvailability(query);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get resource detail (admin)",
    description: "Returns a full admin resource payload including content and cover image URL.",
  })
  @ApiParam({ name: "id", description: "Resource ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Admin resource detail",
    type: AdminResourceDetailDto,
  })
  @ApiResponse({ status: 404, description: "Resource not found" })
  async getById(@Param("id") id: string): Promise<AdminResourceDetailDto> {
    return this.resourcesService.getAdminResourceById(id);
  }

  @Post("cover-upload")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Authorize or finalize a signed resource cover upload",
    description:
      "Returns Cloudinary signed upload parameters for action=authorize and validates URL/publicId for action=finalize.",
  })
  @ApiResponse({
    status: 200,
    description: "Cover upload request handled",
    type: RequestAdminResourceCoverUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid upload request or Cloudinary URL mismatch" })
  async requestCoverUpload(
    @CurrentUser("sub") adminId: string,
    @Body() body: RequestAdminResourceCoverUploadBodyDto
  ): Promise<RequestAdminResourceCoverUploadResponseDto> {
    return this.resourcesService.requestAdminResourceCoverUpload(adminId, body);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create resource (admin)",
    description: "Creates a resource article and optionally publishes it.",
  })
  @ApiResponse({
    status: 201,
    description: "Resource created",
    type: AdminResourceDetailDto,
  })
  @ApiResponse({
    status: 400,
    description: "Validation error, invalid category, or duplicate title/slug",
  })
  async create(
    @Body() body: AdminCreateResourceDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminResourceDetailDto> {
    return this.resourcesService.createAdminResource(body, adminId);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update resource (admin)",
    description: "Updates resource fields, category, and publication state.",
  })
  @ApiParam({ name: "id", description: "Resource ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Resource updated",
    type: AdminResourceDetailDto,
  })
  @ApiResponse({
    status: 400,
    description: "Validation error, invalid category, or duplicate title/slug",
  })
  @ApiResponse({ status: 404, description: "Resource not found" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateResourceDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminResourceDetailDto> {
    return this.resourcesService.updateAdminResource(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete resource (admin)",
    description: "Permanently deletes a resource article.",
  })
  @ApiParam({ name: "id", description: "Resource ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Resource deleted",
    type: AdminDeleteResourceResponseDto,
  })
  @ApiResponse({ status: 404, description: "Resource not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeleteResourceResponseDto> {
    return this.resourcesService.deleteAdminResource(id);
  }
}
