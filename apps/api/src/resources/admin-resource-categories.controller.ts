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
  AdminCreateResourceCategoryDto,
  AdminDeleteResourceCategoryResponseDto,
  AdminResourceCategoriesListQueryDto,
  AdminResourceCategoriesListResponseDto,
  AdminResourceCategoryResponseDto,
  AdminUpdateResourceCategoryDto,
} from "./dto/index.js";
import { ResourcesService } from "./resources.service.js";

@ApiTags("Admin Resources")
@Controller("admin/resource-categories")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.EDITOR)
@ApiBearerAuth("access-token")
export class AdminResourceCategoriesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List resource categories (admin)",
    description:
      "Returns all resource categories for admin management, with optional active-state filtering.",
  })
  @ApiQuery({
    name: "isActive",
    required: false,
    description: "Filter categories by active state",
    schema: { oneOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }] },
  })
  @ApiResponse({
    status: 200,
    description: "Resource categories retrieved",
    type: AdminResourceCategoriesListResponseDto,
  })
  async list(
    @Query() query: AdminResourceCategoriesListQueryDto
  ): Promise<AdminResourceCategoriesListResponseDto> {
    return this.resourcesService.listAdminResourceCategories(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create resource category (admin)",
    description: "Creates a resource category for blog/article organization.",
  })
  @ApiResponse({
    status: 201,
    description: "Resource category created",
    type: AdminResourceCategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or duplicate category name/slug" })
  async create(
    @Body() body: AdminCreateResourceCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminResourceCategoryResponseDto> {
    return this.resourcesService.createAdminResourceCategory(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update resource category (admin)",
    description: "Updates category fields such as name, slug, sort order, and active status.",
  })
  @ApiParam({ name: "id", description: "Category ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Resource category updated",
    type: AdminResourceCategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or duplicate category name/slug" })
  @ApiResponse({ status: 404, description: "Resource category not found" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateResourceCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminResourceCategoryResponseDto> {
    return this.resourcesService.updateAdminResourceCategory(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete resource category (admin)",
    description: "Deletes a category only when no articles are assigned to it.",
  })
  @ApiParam({ name: "id", description: "Category ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Resource category deleted",
    type: AdminDeleteResourceCategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: "Category has assigned articles" })
  @ApiResponse({ status: 404, description: "Resource category not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeleteResourceCategoryResponseDto> {
    return this.resourcesService.deleteAdminResourceCategory(id);
  }
}
