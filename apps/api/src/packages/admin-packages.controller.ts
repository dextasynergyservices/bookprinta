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
  AdminCreatePackageDto,
  AdminDeletePackageResponseDto,
  AdminPackageDto,
  AdminUpdatePackageDto,
} from "./dto/admin-package.dto.js";
import { PackagesService } from "./packages.service.js";

@ApiTags("Admin Packages")
@Controller("admin/packages")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminPackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List packages (admin)",
    description: "Returns all packages including inactive with category summaries.",
  })
  @ApiResponse({
    status: 200,
    description: "Package list",
    type: AdminPackageDto,
    isArray: true,
  })
  async list(): Promise<AdminPackageDto[]> {
    return this.packagesService.listAdminPackages();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create package (admin)",
    description:
      "Creates a package within a category with pricing, page limit, features, and ISBN inclusion.",
  })
  @ApiResponse({
    status: 201,
    description: "Package created",
    type: AdminPackageDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Category not found" })
  @ApiResponse({ status: 409, description: "Package name/slug already exists" })
  async create(
    @Body() body: AdminCreatePackageDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminPackageDto> {
    return this.packagesService.createAdminPackage(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update package (admin)",
    description:
      "Updates package fields such as category, price, page limit, features, ISBN inclusion and active state.",
  })
  @ApiParam({ name: "id", description: "Package ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Package updated",
    type: AdminPackageDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Package or category not found" })
  @ApiResponse({ status: 409, description: "Package name/slug already exists" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdatePackageDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminPackageDto> {
    return this.packagesService.updateAdminPackage(id, body);
  }

  @Delete(":id/permanent")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete package permanently (admin)",
    description: "Permanently deletes a package when it is not linked to orders.",
  })
  @ApiParam({ name: "id", description: "Package ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Package permanently deleted",
    type: AdminDeletePackageResponseDto,
  })
  @ApiResponse({ status: 404, description: "Package not found" })
  @ApiResponse({ status: 409, description: "Cannot delete package with linked orders" })
  async removePermanently(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeletePackageResponseDto> {
    return this.packagesService.deleteAdminPackage(id);
  }
}
