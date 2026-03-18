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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminCreatePackageCategoryDto,
  AdminDeletePackageCategoryResponseDto,
  AdminPackageCategoryDto,
  AdminUpdatePackageCategoryDto,
} from "./dto/admin-package-category.dto.js";
import { PackagesService } from "./packages.service.js";

@ApiTags("Admin Package Categories")
@Controller("admin/package-categories")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminPackageCategoriesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List package categories (admin)",
    description: "Returns all categories including inactive, with package counts.",
  })
  @ApiResponse({
    status: 200,
    description: "Package category list",
    type: AdminPackageCategoryDto,
    isArray: true,
  })
  async list(): Promise<AdminPackageCategoryDto[]> {
    return this.packagesService.listAdminPackageCategories();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create package category (admin)",
    description: "Creates a package category with fixed copy count and sort order.",
  })
  @ApiResponse({
    status: 201,
    description: "Package category created",
    type: AdminPackageCategoryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 409, description: "Category name/slug already exists" })
  async create(
    @Body() body: AdminCreatePackageCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminPackageCategoryDto> {
    return this.packagesService.createAdminPackageCategory(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update package category (admin)",
    description:
      "Updates category fields such as name, description, copies, sort order and active state.",
  })
  @ApiParam({ name: "id", description: "Category ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Package category updated",
    type: AdminPackageCategoryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Category not found" })
  @ApiResponse({ status: 409, description: "Category name/slug already exists" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdatePackageCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminPackageCategoryDto> {
    return this.packagesService.updateAdminPackageCategory(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete package category (admin)",
    description: "Deletes a category only when no packages are assigned.",
  })
  @ApiParam({ name: "id", description: "Category ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Package category deleted",
    type: AdminDeletePackageCategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: "Category not found" })
  @ApiResponse({ status: 409, description: "Cannot delete category with assigned packages" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeletePackageCategoryResponseDto> {
    return this.packagesService.deleteAdminPackageCategory(id);
  }
}
