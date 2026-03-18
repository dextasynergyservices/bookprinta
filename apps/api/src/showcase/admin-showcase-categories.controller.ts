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
import { AdminShowcaseService } from "./admin-showcase.service.js";
import {
  AdminCreateShowcaseCategoryDto,
  AdminDeleteShowcaseCategoryResponseDto,
  AdminShowcaseCategoriesListResponseDto,
  AdminShowcaseCategoryDto,
  AdminUpdateShowcaseCategoryDto,
} from "./dto/index.js";

@ApiTags("Admin Showcase")
@Controller("admin/showcase-categories")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.EDITOR)
@ApiBearerAuth("access-token")
export class AdminShowcaseCategoriesController {
  constructor(private readonly adminShowcaseService: AdminShowcaseService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List showcase categories (admin)",
    description: "Returns all showcase categories, including inactive, with assigned entry counts.",
  })
  @ApiResponse({
    status: 200,
    description: "Showcase categories retrieved",
    type: AdminShowcaseCategoriesListResponseDto,
  })
  async list(): Promise<AdminShowcaseCategoriesListResponseDto> {
    return this.adminShowcaseService.listAdminShowcaseCategories();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create showcase category (admin)",
    description: "Creates a showcase category used for public showcase filters and admin curation.",
  })
  @ApiResponse({
    status: 201,
    description: "Showcase category created",
    type: AdminShowcaseCategoryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 409, description: "Category name/slug already exists" })
  async create(
    @Body() body: AdminCreateShowcaseCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminShowcaseCategoryDto> {
    return this.adminShowcaseService.createAdminShowcaseCategory(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update showcase category (admin)",
    description: "Updates showcase category metadata, order, and active state.",
  })
  @ApiParam({
    name: "id",
    description: "Showcase category ID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Showcase category updated",
    type: AdminShowcaseCategoryDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Showcase category not found" })
  @ApiResponse({ status: 409, description: "Category name/slug already exists" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateShowcaseCategoryDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminShowcaseCategoryDto> {
    return this.adminShowcaseService.updateAdminShowcaseCategory(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete showcase category (admin)",
    description: "Deletes a showcase category only when no showcase entries are assigned to it.",
  })
  @ApiParam({
    name: "id",
    description: "Showcase category ID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Showcase category deleted",
    type: AdminDeleteShowcaseCategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: "Showcase category not found" })
  @ApiResponse({
    status: 409,
    description: "Cannot delete category with assigned showcase entries",
  })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeleteShowcaseCategoryResponseDto> {
    return this.adminShowcaseService.deleteAdminShowcaseCategory(id);
  }
}
