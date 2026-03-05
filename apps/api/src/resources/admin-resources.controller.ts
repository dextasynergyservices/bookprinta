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
  AdminResourcesListQueryDto,
  AdminResourcesListResponseDto,
  AdminUpdateResourceDto,
} from "./dto/index.js";
import { ResourcesService } from "./resources.service.js";

@ApiTags("Admin Resources")
@Controller("admin/resources")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
